-- security-hardening: the database's part of the fixes from the security review of 2026-11-16
-- (context/changes/security-hardening/plan.md, Faza 1; context/changes/security-hardening/security-review.md; Karol's
-- decisions of 2026-11-16 in context/changes/security-hardening/change.md).
--
-- Four closings, each in the functions that hold the rule, replaced (create or replace, the same signatures, defaults,
-- owners and grants) from their latest definitions with only these checks added:
--   - S-20 F3 (context/changes/no-recent-repeats/follow-ups/review-fixes.md): start_game with no list and no
--     p_candidates answers no_questions, a refusal the screens know already (src/lib/rooms/errors.ts); the branch that
--     opened round 1 on p_question_id goes, and with it the refusal invalid_question. p_question_id stays, meaning
--     nothing, only for the signature: its default keeps the Worker's calls by name working, and the RPC gate
--     (tests/unit/room-rpc-gate.test.ts) and the pgTAP check of one version pin it. start_game from
--     *_no_recent_repeats.sql;
--   - at most 50 players in a room, the host included (Karol's decision; PRD): room_full. Every way that adds a row to
--     public.players counts the room's players under the room's row lock it already takes, before the write:
--     join_room in the lobby, admit_latecomer for a latecomer (a request to come back moves a place and adds none, so
--     it never counts), and request_join before it writes a request (a new one, or a rejected one asking again), so a
--     latecomer does not wait for a "Wpuść" that would be refused. A taken nick is checked before the cap in join_room
--     and request_join: only nick_taken offers a player without the cookie to ask to come back to their place
--     (src/pages/j/[token].astro), so a full room still answers it. request_join's answers for a token that is a
--     player already, or whose request waits already, stay { ok: true } in a full room. join_room from
--     *_player_color_choice.sql, request_join and admit_latecomer from *_rejoin_after_refresh.sql;
--   - DB-1: at most 60 new games per account per hour (Karol's decision; above the 37 games the e2e suite opens on one
--     account per run, playwright.config.ts): create_room answers too_many_games when the host has 60 rooms created in
--     the last hour (rooms.created_at, the open one and the closed ones alike; a game deleted with delete_game drops
--     out). Counted by the index rooms_by_host (*_no_recent_repeats.sql), with no new table: a column of time in schema
--     private is what the pgTAP scans refuse;
--   - DB-5: create_room answers invalid_categories also for a list of categories longer than the categories of the
--     shared question base or with a name twice, and for a list of 18+ categories longer than the list of categories or
--     with a name twice (until now only <@ checked it). The lengths first, then the repeats, then the checks of S-17.
--     create_room from *_question_base_checks.sql.
-- Both checks of create_room stand after the session's and before the host's open room is closed, so a refusal
-- changes nothing.
--
-- Deployment order (plan, Faza 3 #4): this migration ships before the Worker's change. The Worker deployed now sends
-- p_candidates since S-20, so its start is answered as before; it shows room_full and too_many_games with its generic
-- text until the merge. A Worker older than S-20, which sent p_question_id, would now get no_questions on every start:
-- rolling the Worker back past S-20 is no longer possible (accepted in that follow-up).
--
-- Nothing here touches a round's urn or a vote: the new checks count rows of public.players and public.rooms and read
-- the lists of categories.
--
-- Never edit this file once it has been pushed; a fix is a new migration.

-- Host: new room ------------------------------------------------------------------------------------------------------

-- Definer now (F1): the host has no write grant of its own. Closes the host's open room, a game in play included (asks
-- first when guests are in it), drops its round's in-progress state, then opens a new one with the host as player 1, in
-- one transaction. p_link_token is ignored: the code is made here. S-18: the host takes the new room's first free
-- colour, 0. S-17: every picked category is one of the shared question base, else invalid_categories, before anything
-- is closed. security-hardening: invalid_categories also for a list longer than the base's categories, or a list of
-- 18+ ones longer than the picked ones, or a name twice in either (DB-5); too_many_games once the host has 60 rooms
-- created in the last hour (DB-1); both before anything is closed.
create or replace function public.create_room(
  p_nick text,
  p_link_token text,
  p_categories text[],
  p_adult_categories text[],
  p_confirm_close boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host uuid := (select auth.uid());
  v_nick text;
  v_open_room uuid;
  v_closed_room uuid;
  v_room uuid;
begin
  if v_host is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
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

  -- security-hardening (DB-5): the lengths first, before a long list is read: no more names than the shared question
  -- base has categories, and no more 18+ names than picked ones (the Worker sends at most the base's categories, each
  -- once, src/pages/api/rooms/index.ts). A null list is left to the check of S-17 below.
  if cardinality(p_categories) > (select count(distinct b.category) from private.question_base b)
    or cardinality(p_adult_categories) > cardinality(p_categories) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_categories');
  end if;

  -- Then each name once in each list. A null in a list is not counted as a name, so it is refused here too.
  if (select count(distinct c.category) from unnest(p_categories) as c (category)) <> cardinality(p_categories)
    or (select count(distinct a.category) from unnest(p_adult_categories) as a (category))
      <> cardinality(p_adult_categories) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_categories');
  end if;

  -- S-17: and every name the category of a row of the shared question base, as the Worker checks it
  -- (src/pages/api/rooms/index.ts): a name the base does not have would pick no question.
  if coalesce(cardinality(p_categories), 0) < 1
    or array_position(p_categories, null) is not null
    or not (coalesce(p_adult_categories, '{}') <@ p_categories)
    or not (p_categories <@ array(select b.category from private.question_base b)) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_categories');
  end if;

  -- security-hardening (DB-1): at most 60 new games per account per hour (Karol's decision of 2026-11-16, above the 37
  -- games the e2e suite opens on one account per run). Every room of the host created in the last hour counts, the open
  -- one and the closed ones alike; a game deleted with delete_game drops out. Before the host's open room is closed, so
  -- the refusal changes nothing.
  if (
    select count(*) from public.rooms r where r.host_id = v_host and r.created_at > now() - interval '1 hour'
  ) >= 60 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_games');
  end if;

  -- One block, so a unique_violation below also undoes closing the old room and dropping its round's state.
  begin
    -- The lock orders this against join_room and the round functions: a guest joining or a vote cast right now is
    -- either counted below or finds the room closed.
    select r.id into v_open_room
    from public.rooms r
    where r.host_id = v_host and r.status in ('lobby', 'playing')
    for update;

    if v_open_room is not null then
      if not coalesce(p_confirm_close, false) and exists (
        select 1 from public.players p where p.room_id = v_open_room and p.user_id is null
      ) then
        return jsonb_build_object('ok', false, 'reason', 'open_room_has_guests');
      end if;

      update public.rooms set status = 'closed' where id = v_open_room;
      -- A round abandoned mid-vote keeps no voter and no count (D1).
      perform private.drop_round_state(v_open_room);
      v_closed_room := v_open_room;
    end if;

    -- 16 random bytes, base64url without padding: 22 characters, as in src/lib/rooms/tokens.ts.
    insert into public.rooms (host_id, link_token, categories, adult_categories)
    values (
      v_host,
      translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/=', '-_'),
      p_categories,
      coalesce(p_adult_categories, '{}')
    )
    returning id into v_room;

    -- The room is new and nobody else sees it before this transaction ends: its first free colour is 0.
    insert into public.players (room_id, nick, user_id, seat, color)
    values (v_room, v_nick, v_host, 1, private.free_color(v_room));
  exception
    -- Two "Załóż grę" at once: the second one hits the one-open-room index.
    when unique_violation then
      return jsonb_build_object('ok', false, 'reason', 'try_again');
  end;

  return jsonb_build_object('ok', true, 'room_id', v_room, 'closed_room_id', v_closed_room);
end;
$$;

-- Guest: join ---------------------------------------------------------------------------------------------------------

-- Definer: a public endpoint for anon. Takes the raw player token and stores only its sha256, so a hash read from
-- anywhere never works as the token. S-18: the new player takes the room's first free colour. security-hardening: a
-- taken nick is nick_taken before anything else is counted, then room_full when the room has 50 players, the host
-- included.
create or replace function public.join_room(p_link_token text, p_nick text, p_player_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room uuid;
  v_status text;
  v_nick text;
  v_player uuid;
  v_constraint text;
begin
  -- The server always sends a fresh 32-byte token; anything else is not our client.
  if p_player_token is null or p_player_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'invalid player token' using errcode = '22023';
  end if;

  if p_link_token is null or p_link_token !~ '^[A-Za-z0-9_-]{22}$' then
    return jsonb_build_object('ok', false, 'reason', 'room_unknown');
  end if;

  -- The row lock makes joins to one room take turns (seat numbers and colours) and orders them against create_room
  -- closing it, start_game fixing who may vote and set_player_color.
  select r.id, r.status into v_room, v_status
  from public.rooms r
  where r.link_token = p_link_token
  for update;

  if v_room is null then
    return jsonb_build_object('ok', false, 'reason', 'room_unknown');
  end if;

  -- A game in play takes no one new; S-08 decides about late players.
  if v_status = 'playing' then
    return jsonb_build_object('ok', false, 'reason', 'game_started');
  end if;

  if v_status <> 'lobby' then
    return jsonb_build_object('ok', false, 'reason', 'room_closed');
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

  -- security-hardening: a taken nick first, as compared (players.nick_key), so a player without the cookie who types
  -- their own nick in a full room still gets nick_taken, the one answer that offers to ask to come back. The insert's
  -- unique_violation below stays as the backstop.
  if exists (
    select 1 from public.players p where p.room_id = v_room and p.nick_key = private.nick_key(v_nick)
  ) then
    return jsonb_build_object('ok', false, 'reason', 'nick_taken');
  end if;

  -- security-hardening: at most 50 players in a room, the host included (PRD; Karol's decision of 2026-11-16). Counted
  -- under the room's lock, so two joining at once never make the 51st.
  if (select count(*) from public.players p where p.room_id = v_room) >= 50 then
    return jsonb_build_object('ok', false, 'reason', 'room_full');
  end if;

  begin
    insert into public.players (room_id, nick, seat, color)
    select v_room, v_nick, coalesce(max(p.seat), 0) + 1, private.free_color(v_room)
    from public.players p
    where p.room_id = v_room
    returning id into v_player;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'players_room_nick_key' then
        return jsonb_build_object('ok', false, 'reason', 'nick_taken');
      end if;
      raise;
  end;

  insert into public.player_secrets (player_id, token_hash)
  values (v_player, sha256(convert_to(p_player_token, 'UTF8')));

  return jsonb_build_object('ok', true, 'room_id', v_room);
end;
$$;

-- Latecomer: ask to join ----------------------------------------------------------------------------------------------

-- Definer: a public endpoint for anon, like join_room, so every check lives here. A game in play takes no one new
-- through join_room; a latecomer asks the host here instead, with the token of the room's cookie, and only its sha256
-- is stored. The checks in join_room's order, all before the first write: the token's format, the link and the room's
-- lock, the room's status, a player already, the nick rule, a request already waiting, a nick taken, the room's 50
-- players (security-hardening: room_full, so a latecomer does not wait for a "Wpuść" that would be refused), the
-- room's limit of 5 waiting. { ok: true } also when nothing changes (a player already, or a request already waiting:
-- the form sent twice), in a full room too, so the screen moves on to the room or to waiting. S-04: a rejected request
-- asks again as a request to join, whatever it asked before; a trace of a place that moved to another token is deleted
-- and the request made as new.
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

  -- security-hardening: at most 50 players in a room, the host included, as in join_room; before both writes below (a
  -- new request, and a rejected one asking again), after nick_taken, which a player of the room needs to hear.
  if (select count(*) from public.players p where p.room_id = v_room) >= 50 then
    return jsonb_build_object('ok', false, 'reason', 'room_full');
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

-- Leader: let in ------------------------------------------------------------------------------------------------------

-- Definer, the leader's: "Wpuść". p_nick is a nick on the leader's list: the pending request with that nick (as
-- compared). A latecomer's request, only while the game is in play, becomes a player at the next seat, under the
-- request's nick, with the request's token hash in player_secrets and the room's first free colour; the new player sees
-- the round in progress and votes from the next question on. S-04: a request to come back, in the lobby and while the
-- game is in play, moves its place to the request's token: the place's old token hash stays as a trace (moved), and
-- the player's row is untouched. Either way the request is deleted. { ok: true } and nothing else, or
-- { ok: false, reason } with reason in room_unknown, not_leader (private.leader_refusal), request_unknown (no such
-- request waiting, or the request's token opens a place of the room already), cohost_protected (a co-host letting back
-- to a co-host's place), room_full (security-hardening: a latecomer's request when the room has 50 players, the host
-- included; the request stays, and a leader may turn it away), latecomer_nick_taken (a backstop). A malformed token
-- raises 22023, in private.leader_refusal.
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

  -- security-hardening: a latecomer takes a new seat, so at most 50 players in a room, the host included, as in
  -- join_room. The request stays: a leader may turn it away. A request to come back (above) adds no seat.
  if (select count(*) from public.players p where p.room_id = p_room_id) >= 50 then
    return jsonb_build_object('ok', false, 'reason', 'room_full');
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

-- Leader: start -------------------------------------------------------------------------------------------------------

-- Definer, the leader's (the host, or a co-host by p_player_token): "Zacznij grę". Fixes who may vote (everyone in the
-- room now, the host included; at least 3, US-01) and opens round 1 with its urn. With a list, round 1 is its first
-- entry not removed, and p_candidates means nothing: list_empty when every entry is removed. With no list, round 1 is
-- the first of p_candidates (S-20), the game's pool in the Worker's order, in the order of the draw
-- (private.ordered_candidates), and no_questions when none is of the room's choice, or when there is no pool
-- (security-hardening, S-20 F3), with nothing written. p_question_id means nothing: it stays only for the signature
-- (its default, the Worker's calls by name and the RPC gate in tests/unit/room-rpc-gate.test.ts). More than 1000
-- candidates raise 22023 before anything is written, with no value of the list in the message. S-11: right before
-- round 1 opens, the list as it stands is counted.
create or replace function public.start_game(
  p_room_id uuid,
  p_question_id text default null,
  p_player_token text default null,
  p_candidates text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host uuid;
  v_status text;
  v_refusal text;
  v_position integer;
  v_question text;
  v_eligible uuid[];
  v_round uuid;
begin
  -- The room's row first: a guest joining or a move on the list right now is either in the round below or finds the
  -- game started.
  select r.host_id, r.status into v_host, v_status
  from public.rooms r
  where r.id = p_room_id
  for update;

  -- Only the room's leader moves the game; anyone else learns nothing about the room.
  v_refusal := private.leader_refusal(p_room_id, v_host, p_player_token);
  if v_refusal is not null then
    return jsonb_build_object('ok', false, 'reason', v_refusal);
  end if;

  if v_status = 'closed' then
    return jsonb_build_object('ok', false, 'reason', 'room_closed');
  end if;

  if v_status <> 'lobby' then
    return jsonb_build_object('ok', false, 'reason', 'game_started');
  end if;

  if exists (select 1 from private.game_questions g where g.room_id = p_room_id) then
    -- The entry's question id only when it has no text of its own.
    select g.position, case when g.text is null then g.question_id end into v_position, v_question
    from private.game_questions g
    where g.room_id = p_room_id and not g.removed
    order by g.position
    limit 1;

    if v_position is null then
      return jsonb_build_object('ok', false, 'reason', 'list_empty');
    end if;
  elsif p_candidates is not null then
    -- As in the other draws: a longer list is malformed input from a client calling the database directly.
    if cardinality(p_candidates) > 1000 then
      raise exception 'too many candidates' using errcode = '22023';
    end if;

    -- S-20: the first candidate in the order of the draw, so of the room's choice, and one the host does not know from
    -- its other games before one it knows.
    select c.question_id into v_question
    from private.ordered_candidates(p_room_id, p_candidates) c
    order by c.place
    limit 1;

    if v_question is null then
      return jsonb_build_object('ok', false, 'reason', 'no_questions');
    end if;
  else
    -- security-hardening (S-20 F3): no list and no pool is no question to open, whatever p_question_id says.
    return jsonb_build_object('ok', false, 'reason', 'no_questions');
  end if;

  select array_agg(p.id order by p.seat) into v_eligible
  from public.players p
  where p.room_id = p_room_id;

  if coalesce(cardinality(v_eligible), 0) < 3 then
    return jsonb_build_object('ok', false, 'reason', 'not_enough_players');
  end if;

  -- S-11: the list as it stands, final now: each entry of the base with no text of its own is listed, and removed too
  -- when the host removed it. No list, no rows; a room closed in the lobby never gets here.
  if private.counts_for_stats(p_room_id) then
    insert into private.question_stats as s (question_id, listed, removed)
    select g.question_id, 1, case when g.removed then 1 else 0 end
    from private.game_questions g
    where g.room_id = p_room_id and g.question_id is not null and g.text is null
    order by g.question_id
    on conflict (question_id) do update
    set listed = s.listed + excluded.listed, removed = s.removed + excluded.removed;
  end if;

  insert into private.rounds (room_id, number, question_id, list_position, eligible)
  values (p_room_id, 1, v_question, v_position, v_eligible)
  returning id into v_round;

  insert into private.ballot_boxes (round_id) values (v_round);

  update public.rooms set status = 'playing', started_at = now() where id = p_room_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- Function owners and grants ------------------------------------------------------------------------------------------

-- A security definer function runs with its owner's rights; on Supabase that must be postgres.
alter function public.create_room(text, text, text[], text[], boolean) owner to postgres;
alter function public.join_room(text, text, text) owner to postgres;
alter function public.request_join(text, text, text) owner to postgres;
alter function public.admit_latecomer(uuid, text, text) owner to postgres;
alter function public.start_game(uuid, text, text, text[]) owner to postgres;

-- As in *_no_recent_repeats.sql: create or replace keeps a function's grants, and the revokes are repeated for every
-- function this file replaces, so each one's grants read in one place.
revoke execute on function public.create_room(text, text, text[], text[], boolean) from public, anon, authenticated;
revoke execute on function public.join_room(text, text, text) from public, anon, authenticated;
revoke execute on function public.request_join(text, text, text) from public, anon, authenticated;
revoke execute on function public.admit_latecomer(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.start_game(uuid, text, text, text[]) from public, anon, authenticated;

-- The same grants as before: creating a room is the signed-in host's; joining, asking to join and a leader's moves are
-- public endpoints (a guest and a co-host have no session), with every check inside.
grant execute on function public.create_room(text, text, text[], text[], boolean) to authenticated;
grant execute on function public.join_room(text, text, text) to anon, authenticated;
grant execute on function public.request_join(text, text, text) to anon, authenticated;
grant execute on function public.admit_latecomer(uuid, text, text) to anon, authenticated;
grant execute on function public.start_game(uuid, text, text, text[]) to anon, authenticated;
