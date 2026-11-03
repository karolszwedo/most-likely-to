-- S-04 rejoin-after-refresh: a guest who lost the room's cookie (another browser, cleared data, a cookie older than
-- 24 h) asks to come back to their own place, and a leader lets them back or turns them away
-- (context/changes/rejoin-after-refresh/plan.md, Faza 3; PRD US-01, FR-011; Karol's decision D2 of
-- context/changes/rejoin-after-refresh/research.md: a request the leader approves, like a latecomer's).
--
-- A request to come back is a row of public.join_requests that names the place (player_id). Its life:
--   - request_return (anon, with the token the Worker keeps in the room's cookie, a fresh one on another browser):
--     pending, in the lobby and while the game is in play, for the nick of a guest of the room. At most 5 requests wait
--     at once per room, latecomers' and returns alike, and two never wait for the same nick;
--   - admit_latecomer (a leader, "Wpuść"): the place moves to the request's token. In one transaction under the room's
--     lock the place's old token hash leaves player_secrets and stays behind as a trace (status moved), the request's
--     token hash takes its place, and the request is deleted. The player's row stays as it is: nick, seat, colour,
--     co-host role, results of past reveals, whether they voted in the round in progress (me_voted, so a second vote
--     gets already_voted) and their thumb on a reveal;
--   - reject_latecomer (a leader, "Odrzuć"): rejected, as a latecomer's request; the same token may ask again;
--   - every closing of the room deletes its requests, traces included (private.drop_round_state, unchanged).
-- A co-host lets back any guest but a co-host: who holds a co-host's place is the host's to decide, as in set_cohost
-- and remove_player (decision 2 of context/changes/remove-player-new-link/research.md), so a co-host gets
-- cohost_protected there. The host comes back by signing in, never through a request: its nick gets
-- host_returns_by_login.
--
-- The trace (status moved): the old token's row, with the place's nick and no player_id, so it is never a request to
-- come back, and neither the limit of 5 nor a taken nick counts it (both count pending requests only). The old device,
-- whose token no longer opens the room (room_lobby: null), learns why from join_request_state: { state: moved, nick }
-- instead of none, which means "removed" (S-09). The old token may ask again, to come back (request_return) or as a
-- latecomer under a new nick (request_join): the trace is deleted and the request made as a new one, so a trace never
-- turns back into a request.
--
-- join_request_state adds returning: true to the state of a request to come back (pending or rejected), so the waiting
-- screen tells it from a latecomer's request, after a reload too; a latecomer's state keeps exactly its keys.
-- room_lobby (same signature, create or replace, from its latest definition in *_remove_player.sql with only the new
-- key and its comment changed) adds returning: the nicks of the pending requests to come back, in the order of asking,
-- for a leader (a subset of requests, which still lists every pending request); [] for anyone else.
--
-- Anonymity: a request names a place, never a vote. Moving a place moves a token, not a vote: private.round_voters and
-- the round's results are keyed by the player's id, which stays, and no function here reads private.ballot_boxes.
--
-- The invariants of every round function in *_first_live_round.sql hold here too: the room's row is locked first,
-- everything is checked before the first write, an expected refusal is data ({ok: false, reason}), never an exception,
-- no function returns a vote's target, and counts appear only once a round is revealed.
--
-- Deployment order (plan, Migration Notes): this migration ships before the Worker that uses it. For the Worker deployed
-- before it, it only adds: request_return is a function nobody calls yet, so no request names a place and no trace
-- exists; request_join, admit_latecomer, reject_latecomer and join_request_state answer a latecomer as before; and that
-- Worker copies only the keys of its own contract from room_lobby, so returning passes it by.
--
-- Never edit this file once it has been pushed; a fix is a new migration.

-- Requests to come back, and the trace -------------------------------------------------------------------------------

-- The place a request asks to come back to; null for a latecomer's request and for a trace. The request goes with the
-- place: removing the player (remove_player) deletes a request to come back to them. Written by the definer functions
-- below only: the table keeps no grants and no policies.
alter table public.join_requests add column player_id uuid references public.players (id) on delete cascade;

-- The foreign key's lookups (removing a player) without a scan of the table.
create index join_requests_player_id on public.join_requests (player_id);

-- moved: the trace of a token whose place moved to another token.
alter table public.join_requests drop constraint join_requests_status_check;
alter table public.join_requests add constraint join_requests_status_check
  check (status in ('pending', 'rejected', 'moved'));

-- A trace never names a place, so nothing ever takes it for a request to come back.
alter table public.join_requests add constraint join_requests_moved_check check (status <> 'moved' or player_id is null);

-- Latecomer: ask to join (unchanged but for the trace and a rejected request to come back) ----------------------------

-- Definer: a public endpoint for anon, like join_room, so every check lives here. A game in play takes no one new
-- through join_room; a latecomer asks the host here instead, with the token of the room's cookie, and only its sha256
-- is stored. The checks in join_room's order, all before the first write: the token's format, the link and the room's
-- lock, the room's status, a player already, the nick rule, a request already waiting, a nick taken, the room's limit
-- of 5 waiting. { ok: true } also when nothing changes (a player already, or a request already waiting: the form sent
-- twice), so the screen moves on to the room or to waiting. S-04: a rejected request asks again as a request to join,
-- whatever it asked before; a trace of a place that moved to another token is deleted and the request made as new.
create or replace function public.request_join(p_link_token text, p_nick text, p_player_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room uuid;
  v_status text;
  v_hash bytea;
  v_nick text;
  v_request uuid;
  v_request_status text;
begin
  -- The server sends the cookie's 32-byte token or a fresh one; anything else is not our client.
  if p_player_token is null or p_player_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'invalid player token' using errcode = '22023';
  end if;

  if p_link_token is null or p_link_token !~ '^[A-Za-z0-9_-]{22}$' then
    return jsonb_build_object('ok', false, 'reason', 'room_unknown');
  end if;

  -- The row lock makes requests to one room take turns (the limit, the nicks) and orders them against a leader letting
  -- someone in, a round opening and the room closing.
  select r.id, r.status into v_room, v_status
  from public.rooms r
  where r.link_token = p_link_token
  for update;

  if v_room is null then
    return jsonb_build_object('ok', false, 'reason', 'room_unknown');
  end if;

  -- Before the start anyone joins through join_room, without the host.
  if v_status = 'lobby' then
    return jsonb_build_object('ok', false, 'reason', 'room_open');
  end if;

  if v_status <> 'playing' then
    return jsonb_build_object('ok', false, 'reason', 'room_closed');
  end if;

  v_hash := sha256(convert_to(p_player_token, 'UTF8'));

  -- Let in already: the screen moves on to the room.
  if exists (
    select 1
    from public.player_secrets s
    join public.players p on p.id = s.player_id
    where s.token_hash = v_hash and p.room_id = v_room
  ) then
    return jsonb_build_object('ok', true);
  end if;

  -- A cap before the nick rule, so its regular expressions never run on a very long text.
  if char_length(p_nick) > 100 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_nick');
  end if;

  -- A nick of only selectors or tags looks empty too.
  v_nick := private.normalize_nick(p_nick);
  if v_nick is null or char_length(v_nick) not between 1 and 20 or private.nick_key(v_nick) = '' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_nick');
  end if;

  select q.id, q.status into v_request, v_request_status
  from public.join_requests q
  where q.token_hash = v_hash and q.room_id = v_room;

  -- Waiting already, under the nick it asked with (to join, or to come back): the form sent twice changes nothing.
  if v_request_status = 'pending' then
    return jsonb_build_object('ok', true);
  end if;

  -- What looks the same is the same nick, among the players and the requests waiting (this token's own request is not
  -- waiting by now, and a trace never waits).
  if exists (
    select 1 from public.players p where p.room_id = v_room and p.nick_key = private.nick_key(v_nick)
  ) or exists (
    select 1 from public.join_requests q
    where q.room_id = v_room and q.status = 'pending' and q.nick_key = private.nick_key(v_nick)
  ) then
    return jsonb_build_object('ok', false, 'reason', 'nick_taken');
  end if;

  -- At most 5 wait at once, so the leader's list never covers the game.
  if (
    select count(*) from public.join_requests q where q.room_id = v_room and q.status = 'pending'
  ) >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'requests_full');
  end if;

  if v_request_status = 'rejected' then
    -- Turned away before: the same request asks again, under the nick sent now, as a request to join (no place, even
    -- if it asked to come back before), and takes its place at the end of the leader's list, as a request made now.
    update public.join_requests
    set nick = v_nick, status = 'pending', player_id = null, created_at = now()
    where id = v_request;
  else
    -- A trace of a place that moved to another token gives way to a new request.
    if v_request is not null then
      delete from public.join_requests where id = v_request;
    end if;

    insert into public.join_requests (room_id, nick, token_hash)
    values (v_room, v_nick, v_hash);
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- Guest without the cookie: ask to come back to one's place -----------------------------------------------------------

-- Definer: a public endpoint for anon, like request_join, so every check lives here. A guest whose cookie is gone asks
-- to come back to the place with nick p_nick (as compared), with the token of the room's cookie on this browser (the
-- Worker's fresh one), in the lobby and while the game is in play. Nothing moves until a leader's "Wpuść"
-- (admit_latecomer). The checks, all before the first write: the token's format, the link and the room's lock, the
-- room's status, a player already, the place, a request already waiting, a nick taken, the room's limit of 5 waiting.
-- { ok: true } also when nothing changes (a player of the room already, whose cookie works after all, or a request of
-- this token already waiting: the form sent twice), so the screen moves on to the room or to waiting; otherwise
-- { ok: false, reason } with reason in room_unknown, room_closed, player_unknown (no player of the room has that nick),
-- host_returns_by_login (the host's nick: the host comes back by signing in), nick_taken (another request waits for that
-- nick), requests_full (5 waiting). A malformed token raises 22023, as in request_join.
create function public.request_return(p_link_token text, p_nick text, p_player_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room uuid;
  v_status text;
  v_hash bytea;
  v_place uuid;
  v_place_nick text;
  v_place_host boolean;
  v_request uuid;
  v_request_status text;
begin
  -- The server sends the cookie's 32-byte token or a fresh one; anything else is not our client.
  if p_player_token is null or p_player_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'invalid player token' using errcode = '22023';
  end if;

  if p_link_token is null or p_link_token !~ '^[A-Za-z0-9_-]{22}$' then
    return jsonb_build_object('ok', false, 'reason', 'room_unknown');
  end if;

  -- The room's row first, as in request_join: the limit, the nicks and a leader's answer take turns.
  select r.id, r.status into v_room, v_status
  from public.rooms r
  where r.link_token = p_link_token
  for update;

  if v_room is null then
    return jsonb_build_object('ok', false, 'reason', 'room_unknown');
  end if;

  if v_status not in ('lobby', 'playing') then
    return jsonb_build_object('ok', false, 'reason', 'room_closed');
  end if;

  v_hash := sha256(convert_to(p_player_token, 'UTF8'));

  -- A player of the room already: the screen moves on to the room. A player's token never asks for another place.
  if exists (
    select 1
    from public.player_secrets s
    join public.players p on p.id = s.player_id
    where s.token_hash = v_hash and p.room_id = v_room
  ) then
    return jsonb_build_object('ok', true);
  end if;

  -- The place: a player of the room with that nick, as compared. A nick over the nick rule's cap is no player's, and its
  -- regular expressions never run on it.
  if char_length(p_nick) <= 100 then
    select p.id, p.nick, p.user_id is not null into v_place, v_place_nick, v_place_host
    from public.players p
    where p.room_id = v_room and p.nick_key = private.nick_key(p_nick);
  end if;

  if v_place is null then
    return jsonb_build_object('ok', false, 'reason', 'player_unknown');
  end if;

  if v_place_host then
    return jsonb_build_object('ok', false, 'reason', 'host_returns_by_login');
  end if;

  select q.id, q.status into v_request, v_request_status
  from public.join_requests q
  where q.token_hash = v_hash and q.room_id = v_room;

  -- Waiting already (to come back, or to join): the form sent twice changes nothing.
  if v_request_status = 'pending' then
    return jsonb_build_object('ok', true);
  end if;

  -- Someone else waits for this nick already: only a request to come back can, since a latecomer never asks with a
  -- player's nick.
  if exists (
    select 1 from public.join_requests q
    where q.room_id = v_room and q.status = 'pending' and q.nick_key = private.nick_key(v_place_nick)
  ) then
    return jsonb_build_object('ok', false, 'reason', 'nick_taken');
  end if;

  -- The latecomers' limit: requests to come back wait on the same list.
  if (
    select count(*) from public.join_requests q where q.room_id = v_room and q.status = 'pending'
  ) >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'requests_full');
  end if;

  if v_request_status = 'rejected' then
    -- Turned away before: the same request asks again, now for this place, at the end of the leader's list.
    update public.join_requests
    set nick = v_place_nick, status = 'pending', player_id = v_place, created_at = now()
    where id = v_request;
  else
    -- A trace of a place that moved to another token gives way to a new request.
    if v_request is not null then
      delete from public.join_requests where id = v_request;
    end if;

    insert into public.join_requests (room_id, nick, token_hash, player_id)
    values (v_room, v_place_nick, v_hash, v_place);
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- Latecomer or guest coming back: how one's own request stands ------------------------------------------------------

-- Definer, for anon and authenticated: how the token's own request stands, for the waiting screen and the room page;
-- writes nothing. { state: "admitted" } once the token is a player of the room; { state: "closed" } once the room is
-- closed (its requests went with it); { state: "pending" | "rejected", nick } for the token's request in the room, with
-- returning: true added when it asks to come back to a place (S-04); { state: "moved", nick } for a token whose place
-- moved to another token by a leader's "Wpuść" (S-04); { state: "none" } otherwise: a malformed token, an unknown room,
-- or a token with nothing in this room. Never the question, the players or anyone else's request: whoever is outside
-- sees nothing of the game.
create or replace function public.join_request_state(p_room_id uuid, p_player_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_hash bytea;
  v_nick text;
  v_request_status text;
  v_returning boolean;
begin
  if p_player_token is null or p_player_token !~ '^[A-Za-z0-9_-]{43}$' then
    return jsonb_build_object('state', 'none');
  end if;

  select r.status into v_status
  from public.rooms r
  where r.id = p_room_id;

  if v_status is null then
    return jsonb_build_object('state', 'none');
  end if;

  v_hash := sha256(convert_to(p_player_token, 'UTF8'));

  if exists (
    select 1
    from public.player_secrets s
    join public.players p on p.id = s.player_id
    where s.token_hash = v_hash and p.room_id = p_room_id
  ) then
    return jsonb_build_object('state', 'admitted');
  end if;

  if v_status = 'closed' then
    return jsonb_build_object('state', 'closed');
  end if;

  select q.nick, q.status, q.player_id is not null into v_nick, v_request_status, v_returning
  from public.join_requests q
  where q.token_hash = v_hash and q.room_id = p_room_id;

  if v_request_status is null then
    return jsonb_build_object('state', 'none');
  end if;

  -- A trace has no place, so it never says returning.
  if v_returning then
    return jsonb_build_object('state', v_request_status, 'nick', v_nick, 'returning', true);
  end if;

  return jsonb_build_object('state', v_request_status, 'nick', v_nick);
end;
$$;

-- Leader: let in, or turn away ----------------------------------------------------------------------------------------

-- Definer, the leader's: "Wpuść". p_nick is a nick on the leader's list: the pending request with that nick (as
-- compared). A latecomer's request, only while the game is in play, becomes a player at the next seat, under the
-- request's nick, with the request's token hash in player_secrets and the room's first free colour; the new player sees
-- the round in progress and votes from the next question on. S-04: a request to come back, in the lobby and while the
-- game is in play, moves its place to the request's token: the place's old token hash stays as a trace (moved), and
-- the player's row is untouched. Either way the request is deleted. { ok: true } and nothing else, or
-- { ok: false, reason } with reason in room_unknown, not_leader (private.leader_refusal), request_unknown (no such
-- request waiting, or the request's token opens a place of the room already), cohost_protected (a co-host letting back
-- to a co-host's place), latecomer_nick_taken (a backstop). A malformed token raises 22023, in private.leader_refusal.
create or replace function public.admit_latecomer(p_room_id uuid, p_nick text, p_player_token text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_host uuid;
  v_status text;
  v_refusal text;
  v_request uuid;
  v_nick text;
  v_hash bytea;
  v_place uuid;
  v_place_nick text;
  v_place_cohost boolean;
  v_old_hash bytea;
  v_player uuid;
  v_constraint text;
begin
  -- The room's row first: a request, a vote or another leader's move right now waits for this one.
  select r.host_id, r.status into v_host, v_status
  from public.rooms r
  where r.id = p_room_id
  for update;

  -- Only the room's leader moves the game; anyone else learns nothing about the room.
  v_refusal := private.leader_refusal(p_room_id, v_host, p_player_token);
  if v_refusal is not null then
    return jsonb_build_object('ok', false, 'reason', v_refusal);
  end if;

  -- A latecomer's request waits only while the game is in play, a request to come back in the lobby too. A nick over
  -- the nick rule's cap is on no list, and its regular expressions never run on it.
  if v_status in ('lobby', 'playing') and char_length(p_nick) <= 100 then
    select q.id, q.nick, q.token_hash, q.player_id into v_request, v_nick, v_hash, v_place
    from public.join_requests q
    where q.room_id = p_room_id
      and q.status = 'pending'
      and q.nick_key = private.nick_key(p_nick)
      and (q.player_id is not null or v_status = 'playing');
  end if;

  -- Let in or turned away already (a double click, another leader's screen), or the room is no longer open.
  if v_request is null then
    return jsonb_build_object('ok', false, 'reason', 'request_unknown');
  end if;

  if v_place is not null then
    select p.nick, p.cohost into v_place_nick, v_place_cohost
    from public.players p
    where p.id = v_place;

    -- Only the host decides who holds a co-host's place. A leader who is not the host is a co-host, known by its token.
    if v_place_cohost and v_user is distinct from v_host then
      return jsonb_build_object('ok', false, 'reason', 'cohost_protected');
    end if;

    -- A token that opens a place of the room already never takes a second one: the Worker never sends one, so such a
    -- request waits until a leader turns it away or the room closes.
    if exists (select 1 from public.player_secrets s where s.token_hash = v_hash) then
      return jsonb_build_object('ok', false, 'reason', 'request_unknown');
    end if;

    select s.token_hash into v_old_hash
    from public.player_secrets s
    where s.player_id = v_place;

    delete from public.join_requests where id = v_request;

    -- The old token's trace, so its device learns why the room no longer opens. A trace of the same token left from
    -- before (it moved once, then the token joined the lobby and took this place) gives way to it.
    if v_old_hash is not null then
      delete from public.join_requests q where q.room_id = p_room_id and q.token_hash = v_old_hash;

      insert into public.join_requests (room_id, nick, token_hash, status)
      values (p_room_id, v_place_nick, v_old_hash, 'moved');
    end if;

    -- The place's one token is now the request's: the old cookie opens nothing, the new one opens this place.
    insert into public.player_secrets (player_id, token_hash)
    values (v_place, v_hash)
    on conflict (player_id) do update set token_hash = excluded.token_hash;

    return jsonb_build_object('ok', true);
  end if;

  -- A backstop only: request_join keeps a waiting nick apart from the players under the room's lock, and nobody joins
  -- a game in play another way. Its own refusal, because nick_taken speaks to the one who asks, not to the leader.
  begin
    insert into public.players (room_id, nick, seat, color)
    select p_room_id, v_nick, coalesce(max(p.seat), 0) + 1, private.free_color(p_room_id)
    from public.players p
    where p.room_id = p_room_id
    returning id into v_player;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'players_room_nick_key' then
        return jsonb_build_object('ok', false, 'reason', 'latecomer_nick_taken');
      end if;
      raise;
  end;

  insert into public.player_secrets (player_id, token_hash)
  values (v_player, v_hash);

  delete from public.join_requests where id = v_request;

  return jsonb_build_object('ok', true);
end;
$$;

-- Definer, the leader's: "Odrzuć", with admit_latecomer's checks, a request to come back in the lobby too. The request
-- stays, rejected: the screen of the one who asked says so, and the same token may ask again through request_join or
-- request_return. Its nick is free for others meanwhile. Any leader turns away any request: that moves no place.
create or replace function public.reject_latecomer(p_room_id uuid, p_nick text, p_player_token text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host uuid;
  v_status text;
  v_refusal text;
  v_request uuid;
begin
  -- The room's row first, as in admit_latecomer.
  select r.host_id, r.status into v_host, v_status
  from public.rooms r
  where r.id = p_room_id
  for update;

  -- Only the room's leader moves the game; anyone else learns nothing about the room.
  v_refusal := private.leader_refusal(p_room_id, v_host, p_player_token);
  if v_refusal is not null then
    return jsonb_build_object('ok', false, 'reason', v_refusal);
  end if;

  if v_status in ('lobby', 'playing') and char_length(p_nick) <= 100 then
    select q.id into v_request
    from public.join_requests q
    where q.room_id = p_room_id
      and q.status = 'pending'
      and q.nick_key = private.nick_key(p_nick)
      and (q.player_id is not null or v_status = 'playing');
  end if;

  if v_request is null then
    return jsonb_build_object('ok', false, 'reason', 'request_unknown');
  end if;

  update public.join_requests set status = 'rejected' where id = v_request;

  return jsonb_build_object('ok', true);
end;
$$;

-- State for the screens -----------------------------------------------------------------------------------------------

-- Definer: the room's state for its host (auth.uid()) or for a player whose token hash is in this room; null for anyone
-- else, whether or not the room exists, a latecomer still waiting and a token whose place moved included. Returns nicks
-- in seat order and no ids, user ids or hashes, and the link code only to a leader (link_token, below), plus the latest
-- round of a game in play: who may vote in it (eligible: the players when it opened, in seat order, so someone let in
-- since then is among the players but not here until the next question), who has voted while it is open (never how,
-- never a count) and whether the round before it was skipped (after_skip); the counts per nick once it is revealed;
-- only its number and phase once it is skipped. A voting or revealed round says its question by question_id, or, for
-- an entry of the list with a text of its own, by question_text (null otherwise). No round in the lobby, and none once
-- the room is closed: a round that ended without a reveal has no counts to show. players: { nick, host, cohost, color }
-- each, so everyone sees who leads and each player's colour (S-18: players.color, 0-19, the same all game unless its
-- player changes it; only here, never in a round's data). A leader is the host or a co-host (S-07). requests: the nicks
-- of every pending request, a latecomer's or one to come back, in the order of asking, for a leader; [] for anyone
-- else, and in every status (none once the room is closed). returning (S-04): the nicks of the pending requests to come
-- back to a place, in the same order, for a leader; a subset of requests; [] for anyone else. question_list: for the
-- host of a room with a list, in every status, its entries not removed in the order of positions and the number of its
-- rows with a question id of the base (base_count, removed and reworded entries included); null for a guest, a co-host
-- included, and for a room with no list. leader_draw: for a leader, in every status, what the leader's moves need, for
-- the Worker only: the room's categories and its 18+ ones, the number of the list's entries not removed (list_entries)
-- and its base_count (list_base_count), both 0 with no list; never the list itself; null for anyone else. link_token:
-- for a leader, in every status, the room's link code, for the Worker, which makes the players' link of it (S-09:
-- removing a player replaces the code, and every leader's screen gets the new one with the next fetch); null for anyone
-- else. game_totals: for a closed room with a revealed round, the number of its revealed rounds (revealed) and the sums
-- of their results (totals: every player with a result in at least one of them, as nick and votes, in seat order, zeros
-- included); only counts per nick from the reveals, never a voter; null in the lobby, while the game is in play and for
-- a closed room with no revealed round.
create or replace function public.room_lobby(p_room_id uuid, p_player_token text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_host uuid;
  v_status text;
  v_categories text[];
  v_adult_categories text[];
  v_link_token text;
  v_role text;
  v_leader boolean;
  v_me text;
  v_me_id uuid;
  v_me_cohost boolean;
  v_round uuid;
  v_number integer;
  v_question text;
  v_list_position integer;
  v_question_text text;
  v_phase text;
  v_eligible uuid[];
  v_abstained integer;
  v_ballots integer;
  v_round_state jsonb;
  v_requests jsonb := '[]'::jsonb;
  v_returning jsonb := '[]'::jsonb;
  v_question_list jsonb;
  v_leader_draw jsonb;
  v_revealed integer;
  v_game_totals jsonb;
begin
  select r.host_id, r.status, r.categories, r.adult_categories, r.link_token
  into v_host, v_status, v_categories, v_adult_categories, v_link_token
  from public.rooms r
  where r.id = p_room_id;

  if v_host is null then
    return null;
  end if;

  if v_user is not null and v_user = v_host then
    v_role := 'host';
    select p.id, p.nick into v_me_id, v_me
    from public.players p
    where p.room_id = p_room_id and p.user_id = v_user;
  elsif p_player_token ~ '^[A-Za-z0-9_-]{43}$' then
    select p.id, p.nick, p.cohost into v_me_id, v_me, v_me_cohost
    from public.player_secrets s
    join public.players p on p.id = s.player_id
    where s.token_hash = sha256(convert_to(p_player_token, 'UTF8')) and p.room_id = p_room_id;

    if v_me is null then
      return null;
    end if;
    v_role := 'guest';
  else
    return null;
  end if;

  -- The leader is the host or a co-host, as in private.leader_refusal.
  v_leader := v_role = 'host' or coalesce(v_me_cohost, false);

  -- Only a leader decides who comes in or back, so only a leader sees who asks, and which of them asks to come back.
  if v_leader then
    select
      coalesce(jsonb_agg(q.nick order by q.created_at, q.id), '[]'::jsonb),
      coalesce(jsonb_agg(q.nick order by q.created_at, q.id) filter (where q.player_id is not null), '[]'::jsonb)
    into v_requests, v_returning
    from public.join_requests q
    where q.room_id = p_room_id and q.status = 'pending';
  end if;

  -- Only the host reviews the list, so only the host sees it: a guest, a co-host included, learns a question when its
  -- round opens.
  if v_role = 'host' and exists (select 1 from private.game_questions g where g.room_id = p_room_id) then
    v_question_list := jsonb_build_object(
      'entries', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object('position', g.position, 'question_id', g.question_id, 'text', g.text)
            order by g.position
          ),
          '[]'::jsonb
        )
        from private.game_questions g
        where g.room_id = p_room_id and not g.removed
      ),
      'base_count', (
        select count(*) from private.game_questions g where g.room_id = p_room_id and g.question_id is not null
      )
    );
  end if;

  -- What a leader's moves need from the room, for the Worker only (it never goes to a screen): the picked categories
  -- and their 18+ ones, to draw the next question, and two numbers of the game's question list, to count the questions
  -- left: its entries not removed (list_entries) and its rows with a question id of the base (list_base_count, removed
  -- and reworded entries included), both 0 with no list. Never the list itself, which stays the host's.
  if v_leader then
    v_leader_draw := jsonb_build_object(
      'categories', to_jsonb(v_categories),
      'adult_categories', to_jsonb(v_adult_categories),
      'list_entries', (
        select count(*)::integer from private.game_questions g where g.room_id = p_room_id and not g.removed
      ),
      'list_base_count', (
        select count(*)::integer
        from private.game_questions g
        where g.room_id = p_room_id and g.question_id is not null
      )
    );
  end if;

  if v_status = 'playing' then
    select r.id, r.number, r.question_id, r.list_position, r.phase, r.eligible, r.abstained, r.ballots
    into v_round, v_number, v_question, v_list_position, v_phase, v_eligible, v_abstained, v_ballots
    from private.rounds r
    where r.room_id = p_room_id
    order by r.number desc
    limit 1;
  end if;

  -- An own or reworded question has no question id: its text comes from its entry of the list.
  if v_round is not null and v_phase <> 'skipped' and v_question is null then
    select g.text into v_question_text
    from private.game_questions g
    where g.room_id = p_room_id and g.position = v_list_position;
  end if;

  if v_round is not null and v_phase = 'voting' then
    -- Who may vote and who has voted, both in seat order: never the order of voting.
    v_round_state := jsonb_build_object(
      'number', v_number,
      'question_id', v_question,
      'question_text', v_question_text,
      'phase', v_phase,
      'eligible', (
        select coalesce(jsonb_agg(p.nick order by p.seat), '[]'::jsonb)
        from public.players p
        where p.room_id = p_room_id and p.id = any (v_eligible)
      ),
      'voted', (
        select coalesce(jsonb_agg(p.nick order by p.seat), '[]'::jsonb)
        from private.round_voters v
        join public.players p on p.id = v.player_id
        where v.round_id = v_round
      ),
      'me_voted', exists (
        select 1 from private.round_voters v where v.round_id = v_round and v.player_id = v_me_id
      ),
      'after_skip', exists (
        select 1 from private.rounds r
        where r.room_id = p_room_id and r.number = v_number - 1 and r.phase = 'skipped'
      )
    );
  elsif v_round is not null and v_phase = 'skipped' then
    -- Its votes are gone: no count, no question, not even who voted.
    v_round_state := jsonb_build_object('number', v_number, 'phase', v_phase);
  elsif v_round is not null then
    -- Every eligible player in seat order, zeros included: counts per nick and nothing more.
    v_round_state := jsonb_build_object(
      'number', v_number,
      'question_id', v_question,
      'question_text', v_question_text,
      'phase', v_phase,
      'results', (
        select coalesce(
          jsonb_agg(jsonb_build_object('nick', p.nick, 'votes', rr.votes) order by p.seat),
          '[]'::jsonb
        )
        from private.round_results rr
        join public.players p on p.id = rr.player_id
        where rr.round_id = v_round
      ),
      'abstained', v_abstained,
      'ballots', v_ballots
    );
  end if;

  -- The sums of the reveals, only once the room is closed: every count in them is one a reveal already showed the room.
  -- Skipped rounds and a round ended without a reveal have no results, and are not counted.
  if v_status = 'closed' then
    select count(*) into v_revealed
    from private.rounds r
    where r.room_id = p_room_id and r.phase = 'revealed';

    if v_revealed > 0 then
      -- Every player with a result in a revealed round, in seat order, zeros included: a sum per nick and nothing more.
      -- A latecomer who could vote in no revealed round has no result, so is not here.
      v_game_totals := jsonb_build_object(
        'revealed', v_revealed,
        'totals', (
          select coalesce(
            jsonb_agg(jsonb_build_object('nick', t.nick, 'votes', t.votes) order by t.seat),
            '[]'::jsonb
          )
          from (
            select p.nick, p.seat, sum(rr.votes)::integer as votes
            from private.rounds r
            join private.round_results rr on rr.round_id = r.id
            join public.players p on p.id = rr.player_id
            where r.room_id = p_room_id and r.phase = 'revealed'
            group by p.id, p.nick, p.seat
          ) t
        )
      );
    end if;
  end if;

  return jsonb_build_object(
    'status', v_status,
    'role', v_role,
    'me', v_me,
    'players', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object('nick', p.nick, 'host', p.user_id is not null, 'cohost', p.cohost, 'color', p.color)
          order by p.seat
        ),
        '[]'::jsonb
      )
      from public.players p
      where p.room_id = p_room_id
    ),
    'round', v_round_state,
    'requests', v_requests,
    -- S-04: which of the requests ask to come back, so a leader's screen says "chce wrócić" by their nick.
    'returning', v_returning,
    'question_list', v_question_list,
    'leader_draw', v_leader_draw,
    -- S-09: the players' link is the leaders' to share, so only a leader gets its code; nobody else learns it here.
    'link_token', case when v_leader then v_link_token end,
    'game_totals', v_game_totals
  );
end;
$$;

-- Function owners and grants ------------------------------------------------------------------------------------------

-- A security definer function runs with its owner's rights; on Supabase that must be postgres.
alter function public.request_join(text, text, text) owner to postgres;
alter function public.request_return(text, text, text) owner to postgres;
alter function public.join_request_state(uuid, text) owner to postgres;
alter function public.admit_latecomer(uuid, text, text) owner to postgres;
alter function public.reject_latecomer(uuid, text, text) owner to postgres;
alter function public.room_lobby(uuid, text) owner to postgres;

-- As in *_remove_player.sql: create or replace keeps a function's grants, and the revokes are repeated for every
-- function this file creates or replaces, so each one's grants read in one place.
revoke execute on function public.request_join(text, text, text) from public, anon, authenticated;
revoke execute on function public.request_return(text, text, text) from public, anon, authenticated;
revoke execute on function public.join_request_state(uuid, text) from public, anon, authenticated;
revoke execute on function public.admit_latecomer(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.reject_latecomer(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.room_lobby(uuid, text) from public, anon, authenticated;

-- The one who asks has no session, and neither has a co-host: asking, coming back, one's own request's state and the
-- leader's answers are public endpoints, with every check inside. The room's state stays readable by its guests.
grant execute on function public.request_join(text, text, text) to anon, authenticated;
grant execute on function public.request_return(text, text, text) to anon, authenticated;
grant execute on function public.join_request_state(uuid, text) to anon, authenticated;
grant execute on function public.admit_latecomer(uuid, text, text) to anon, authenticated;
grant execute on function public.reject_latecomer(uuid, text, text) to anon, authenticated;
grant execute on function public.room_lobby(uuid, text) to anon, authenticated;
