-- S-18 player-color-choice: a player's colour is stored, the first free one comes with the way in, and the player
-- changes it (context/changes/player-color-choice/plan.md, Faza 1; PRD FR-025; the owner's decisions 1-6 in
-- context/changes/player-color-choice/research.md, "Decyzje do planu").
--
-- Until now a colour was no data: the browser gave each nick the colour of its place in room_lobby's list of players
-- (seat order, modulo the palette's 20 colours; seatColors in src/lib/rooms/chart.ts). Now it is players.color, the
-- number 0-19 of a colour of the game's palette (src/components/room/chart-colors.ts), for the whole game. Existing
-- rows get (seat - 1) % 20: seats have no gaps (the host 1, then max(seat) + 1, and nobody leaves), so that is exactly
-- the colour each player has today, in the summaries of closed games too, and the deployment changes nobody's colour.
--
-- Up to 20 players no two share a colour; from the 21st on colours repeat, as they did (decision 6), so there is no
-- unique index on (room_id, color): a check under the room's row lock keeps the colours apart, as it does a taken nick.
-- Every function that adds a player (create_room, join_room, admit_latecomer) or changes a colour (set_player_color)
-- holds that lock. The column has no default: a way of adding a player that this file forgot fails on not null instead
-- of giving colour 0 quietly. The three functions that add a player are replaced in this transaction, each from its
-- latest definition with only the player's insert changed, so no one coming in finds the column not null without a
-- colour, and nothing of the co-host (S-07), the sums (S-15) or the requests (S-08) goes back.
--
-- private.free_color: the colour a player gets on the way in, the lowest one no player of the room has; with all 20
-- taken, the number of the room's players modulo 20. set_player_color: a public endpoint for a player of the room, the
-- host by auth.uid() or a guest by the sha256 of the token, in the lobby and while the game is in play; color_taken
-- when another player of the room has the colour. room_lobby (same signature, create or replace): a player is { nick,
-- host, cohost, color }.
--
-- Anonymity: a colour is a public trait of a player, like the nick, which everyone sees in the list of players. It
-- lives only on players: never in the round's tables (private.rounds, round_results, ballot_boxes, round_voters,
-- round_reactions), never in private.question_stats and never in a log. No round function reads it.
--
-- Deployment order (plan, Critical Implementation Details): this migration ships before the Worker that uses it. For
-- the Worker deployed before it, it only adds: the ways in keep their arguments, set_player_color is a function nobody
-- calls yet, and that Worker copies only the keys of its own contract from room_lobby, so color passes it by. The new
-- Worker requires players[].color, which only this migration gives.
--
-- Never edit this file once it has been pushed; a fix is a new migration.

-- The player's colour ------------------------------------------------------------------------------------------------

-- Added with no constraint, filled with today's colour of each player, then made required: no default, so a forgotten
-- way of adding a player is an error, not colour 0. Written by the functions below only: no API role gets more on
-- players than select, and no grant or policy is added. The functions give seat 1 and up, but seat has no check and a
-- signed-in user could once insert players directly, so a seat below 1 is folded into the palette too, never a negative
-- remainder that would fail the check and the whole push (review of S-18, F2).
alter table public.players add column color smallint;
update public.players set color = ((seat - 1) % 20 + 20) % 20;
alter table public.players alter column color set not null;
alter table public.players add constraint players_color_check check (color between 0 and 19);

-- The first free colour: no grants, called only from the definer functions below -----------------------------------

-- The colour a player gets on the way in: the lowest of the palette's 20 that no player of the room has; with all 20
-- taken (the 21st player on), the number of the room's players modulo 20, so colours repeat in seat order as they did
-- (decision 6). The caller holds the room's row lock (create_room: a room nobody else sees yet), so two players coming
-- in at once never get the same free colour, and a change of colour right now waits its turn.
create function private.free_color(p_room_id uuid)
returns smallint
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (
      select min(c.color)
      from generate_series(0, 19) as c (color)
      where not exists (select 1 from public.players p where p.room_id = p_room_id and p.color = c.color)
    ),
    (select count(*) % 20 from public.players p where p.room_id = p_room_id)
  )::smallint
$$;

-- Host: new room ------------------------------------------------------------------------------------------------------

-- Definer now (F1): the host has no write grant of its own. Closes the host's open room, a game in play included (asks
-- first when guests are in it), drops its round's in-progress state, then opens a new one with the host as player 1, in
-- one transaction. p_link_token is ignored: the code is made here. S-18: the host takes the new room's first free
-- colour, 0.
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

  if coalesce(cardinality(p_categories), 0) < 1
    or array_position(p_categories, null) is not null
    or not (coalesce(p_adult_categories, '{}') <@ p_categories) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_categories');
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
-- anywhere never works as the token. S-18: the new player takes the room's first free colour.
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

-- Leader: let a latecomer in ------------------------------------------------------------------------------------------

-- Definer, the leader's: "Wpuść". p_nick is a nick on the leader's list: the pending request with that nick (as
-- compared) becomes a player at the next seat, under the request's nick, with the request's token hash in
-- player_secrets; the request is deleted. The new player sees the round in progress and votes from the next question
-- on: who votes in a round stays who was in the room when it opened. S-18: the new player takes the room's first free
-- colour, as one joining the lobby does; a latecomer still waiting has none.
create or replace function public.admit_latecomer(p_room_id uuid, p_nick text, p_player_token text default null)
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
  v_nick text;
  v_hash bytea;
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

  -- Requests wait only while the game is in play. A nick over the nick rule's cap is on no list, and its regular
  -- expressions never run on it.
  if v_status = 'playing' and char_length(p_nick) <= 100 then
    select q.id, q.nick, q.token_hash into v_request, v_nick, v_hash
    from public.join_requests q
    where q.room_id = p_room_id and q.status = 'pending' and q.nick_key = private.nick_key(p_nick);
  end if;

  -- Let in or turned away already (a double click, another leader's screen), or the room is no longer in play.
  if v_request is null then
    return jsonb_build_object('ok', false, 'reason', 'request_unknown');
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

-- Player: change one's own colour -------------------------------------------------------------------------------------

-- Definer, a public endpoint for any player of the room: the colour dot by the player's own nick, in the lobby and
-- while the game is in play (decisions 1, 2 and 4: the host picks on the same rules, with no colour kept for it). The
-- player is the host by auth.uid(), or a player of this room by the sha256 of p_player_token, as in cast_vote, so a
-- signed-in person who is a guest in another person's room is known by the token; a latecomer still waiting has no
-- player row yet. p_color is a colour of the palette, 0-19. { ok: true } and nothing else, also when the player has
-- that colour already (a double click, a second screen), or { ok: false, reason } with reason in room_unknown (not a
-- player of this room, or no room), room_closed, color_taken (another player of the room has it; from the 21st player
-- on, every colour is someone's). A colour outside the palette or a malformed token is not our client: 22023. Writes
-- only the player's own colour, and nothing of any round.
create function public.set_player_color(p_room_id uuid, p_color integer, p_player_token text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_host uuid;
  v_status text;
  v_player uuid;
  v_color smallint;
begin
  -- The screen sends one of the palette's 20 colours; anything else is not our client.
  if p_color is null or p_color not between 0 and 19 then
    raise exception 'invalid color' using errcode = '22023';
  end if;

  -- The server sends either no token (the host) or the cookie's 32-byte token; anything else is not our client.
  if p_player_token is not null and p_player_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'invalid player token' using errcode = '22023';
  end if;

  -- The room's row first: someone coming in or another change of colour right now takes its turn, so two players asking
  -- for the same free colour at once never both get it.
  select r.host_id, r.status into v_host, v_status
  from public.rooms r
  where r.id = p_room_id
  for update;

  if v_host is not null and v_user is not null and v_user = v_host then
    select p.id, p.color into v_player, v_color
    from public.players p
    where p.room_id = p_room_id and p.user_id = v_user;
  elsif v_host is not null and p_player_token is not null then
    select p.id, p.color into v_player, v_color
    from public.player_secrets s
    join public.players p on p.id = s.player_id
    where s.token_hash = sha256(convert_to(p_player_token, 'UTF8')) and p.room_id = p_room_id;
  end if;

  -- Someone who is not a player of this room, or no room at all, learns nothing about it.
  if v_player is null then
    return jsonb_build_object('ok', false, 'reason', 'room_unknown');
  end if;

  if v_status = 'closed' then
    return jsonb_build_object('ok', false, 'reason', 'room_closed');
  end if;

  -- The player's own colour again changes nothing. Any other colour must be no other player's.
  if v_color <> p_color then
    if exists (
      select 1 from public.players p where p.room_id = p_room_id and p.color = p_color and p.id <> v_player
    ) then
      return jsonb_build_object('ok', false, 'reason', 'color_taken');
    end if;

    update public.players set color = p_color where id = v_player;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- State for the screens -----------------------------------------------------------------------------------------------

-- Definer: the room's state for its host (auth.uid()) or for a player whose token hash is in this room; null for anyone
-- else, whether or not the room exists, a latecomer still waiting included. Returns nicks in seat order and no ids,
-- user ids, hashes or link code, plus the latest round of a game in play: who may vote in it (eligible: the players
-- when it opened, in seat order, so someone let in since then is among the players but not here until the next
-- question), who has voted while it is open (never how, never a count) and whether the round before it was skipped
-- (after_skip); the counts per nick once it is revealed; only its number and phase once it is skipped. A voting or
-- revealed round says its question by question_id, or, for an entry of the list with a text of its own, by
-- question_text (null otherwise). No round in the lobby, and none once the room is closed: a round that ended without a
-- reveal has no counts to show. players: { nick, host, cohost, color } each, so everyone sees who leads and each
-- player's colour (S-18: players.color, 0-19, the same all game unless its player changes it; only here, never in a
-- round's data). A leader is the host or a co-host (S-07). requests: the nicks of the latecomers waiting, in the order
-- of asking, for a leader; [] for anyone else, and in every status (none before the start, and none once the room is
-- closed). question_list: for the host of a room with a list, in every status, its entries not removed in the order of
-- positions and the number of its rows with a question id of the base (base_count, removed and reworded entries
-- included); null for a guest, a co-host included, and for a room with no list. leader_draw: for a leader, in every
-- status, what the leader's moves need, for the Worker only: the room's categories and its 18+ ones, the number of the
-- list's entries not removed (list_entries) and its base_count (list_base_count), both 0 with no list; never the list
-- itself; null for anyone else. game_totals: for a closed room with a revealed round, the number of its revealed rounds
-- (revealed) and the sums of their results (totals: every player with a result in at least one of them, as nick and
-- votes, in seat order, zeros included); only counts per nick from the reveals, never a voter; null in the lobby, while
-- the game is in play and for a closed room with no revealed round.
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
  v_question_list jsonb;
  v_leader_draw jsonb;
  v_revealed integer;
  v_game_totals jsonb;
begin
  select r.host_id, r.status, r.categories, r.adult_categories
  into v_host, v_status, v_categories, v_adult_categories
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

  -- Only a leader decides who comes in, so only a leader sees who asks.
  if v_leader then
    select coalesce(jsonb_agg(q.nick order by q.created_at, q.id), '[]'::jsonb) into v_requests
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
    'question_list', v_question_list,
    'leader_draw', v_leader_draw,
    'game_totals', v_game_totals
  );
end;
$$;

-- Function owners and grants ------------------------------------------------------------------------------------------

-- A security definer function runs with its owner's rights; on Supabase that must be postgres. The helper too, as
-- private.leader_refusal in *_co_host_role.sql: the definer functions call it as postgres.
alter function private.free_color(uuid) owner to postgres;
alter function public.create_room(text, text, text[], text[], boolean) owner to postgres;
alter function public.join_room(text, text, text) owner to postgres;
alter function public.admit_latecomer(uuid, text, text) owner to postgres;
alter function public.set_player_color(uuid, integer, text) owner to postgres;
alter function public.room_lobby(uuid, text) owner to postgres;

-- As in *_co_host_role.sql: create or replace keeps a function's grants, and the revokes are repeated for every
-- function this file creates or replaces, so each one's grants read in one place. The private helper gets none: only
-- definer functions call it.
revoke execute on function private.free_color(uuid) from public, anon, authenticated;
revoke execute on function public.create_room(text, text, text[], text[], boolean) from public, anon, authenticated;
revoke execute on function public.join_room(text, text, text) from public, anon, authenticated;
revoke execute on function public.admit_latecomer(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.set_player_color(uuid, integer, text) from public, anon, authenticated;
revoke execute on function public.room_lobby(uuid, text) from public, anon, authenticated;

-- The same grants as before for the functions replaced here. A guest has no session, so changing one's own colour is a
-- public endpoint, with every check inside, like the vote.
grant execute on function public.create_room(text, text, text[], text[], boolean) to authenticated;
grant execute on function public.join_room(text, text, text) to anon, authenticated;
grant execute on function public.admit_latecomer(uuid, text, text) to anon, authenticated;
grant execute on function public.set_player_color(uuid, integer, text) to anon, authenticated;
grant execute on function public.room_lobby(uuid, text) to anon, authenticated;
