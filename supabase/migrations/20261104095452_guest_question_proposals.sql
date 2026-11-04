-- S-10 guest-question-proposals: a player proposes a question during the evening, and a leader approves or rejects it
-- (context/changes/guest-question-proposals/plan.md, Faza 1; PRD FR-013, FR-014, FR-021; Karol's decisions 1-5 at the
-- top of that plan).
--
-- A proposal is a row of private.question_proposals, the one place where an author meets a text. Its life:
--   - propose_question (any player of the room, the host and the co-hosts included, in the lobby and while the game is
--     in play): a new row with the text, waiting for a leader. Its number is max(number) + 1 under the room's lock, and
--     it comes back only when the author of the highest number is removed; a leader's stale screen refreshes with the
--     bell of that removal, so the plan accepts that window. Each player has 3 proposals per game, the decided ones
--     included (decision 4): private.proposals_left is the one place with that number. The player's own waiting text
--     sent again writes nothing, so a double send uses up no proposal;
--   - approve_proposal (a leader, only once the game has started, decision 1): the text alone becomes a new entry of
--     the game's question list, private.game_questions, with proposed = true, and the proposal's text is set to null.
--     No author goes with it, so the approved question stays with the room for the game's creator to read (FR-021);
--   - reject_proposal (a leader, in the lobby too, since it does not touch the list): the proposal's text is set to
--     null;
--   - a row with no text is a used proposal: it still counts against the limit, and it does not say how it was decided
--     (decision 5: the author sees only how many wait and how many are left);
--   - every closing of the room deletes its rows (private.drop_round_state, end_game, "Nowa gra", the sweep of stale
--     games). The hourly sweep also deletes the rows of a room still in the lobby 12 hours after it was created, used
--     ones included, so the limit of such a room starts over (accepted in the plan), and the room stays in the lobby;
--   - a player's rows go with the player (on delete cascade, remove_player), so a removed player who comes back with
--     the new link is a new player with 3 new proposals (accepted in the plan). Moving a place to another device (S-04)
--     moves a token and keeps the player's id, so it keeps the limit.
--
-- Why nothing is approved before the start: open_question_list and start_game take any row of private.game_questions
-- for a reviewed list, so a row written in the lobby would stop the 15 questions from being drawn. Both stay as they
-- are, and so do the other four functions of the list.
--
-- The queue (decision 2): an approved question plays in the next round, ahead of the rest of the list, also when the
-- questions have run out (next_round refuses only a round still voting), through private.open_next_round, which reads
-- the list live. Several approved questions play in the order of approval, since each takes max(position) + 1. It has
-- no question id, so it is outside private.question_stats, as an own question is, and its text reaches the players as
-- question_text when its round opens. A position stays the entry's fixed handle, and proposed changes nothing until a
-- row has it, which only approve_proposal writes.
--
-- room_lobby (same signature, create or replace, from its latest definition in *_rejoin_after_refresh.sql with only the
-- new keys and its comment changed) adds proposals, the waiting ones with their author's nick, a leader's only and []
-- for anyone else, and own_proposals, { left, waiting } for every player. The text is never in the bell, the address or
-- a log: it goes out only through room_lobby, after the check of the role (decision 3: only a leader sees who
-- proposed).
--
-- A proposal is not a vote and names no vote, and private.question_proposals holds neither a time nor a sequence, as
-- every table of schema private. It is unlogged, like the urn and the thumbs: a crash empties it, so the proposals
-- waiting are lost and the limits start over, and the pair of an author and a text never reaches the WAL.
--
-- The invariants of every round function in *_first_live_round.sql hold here too: the room's row is locked first,
-- everything is checked before the first write, an expected refusal is data ({ok: false, reason}), never an exception,
-- no function returns a vote's target, and counts appear only once a round is revealed.
--
-- Deployment order (plan, Critical Implementation Details): this migration ships before the Worker that uses it, and
-- only adds. For the Worker deployed before it the three functions are ones nobody calls yet, so no proposal exists and
-- no row has proposed; next_round, skip_round, the closing of a room and the sweep answer as before; and that Worker
-- copies only the keys of its own contract from room_lobby, so proposals and own_proposals pass it by. The new Worker
-- requires both keys, which only this migration gives, so merging it before the push would stop every room from
-- opening.
--
-- Never edit this file once it has been pushed; a fix is a new migration.

-- The proposals and the mark on the list: schema private, no grants, no policies --------------------------------------

-- One row per proposal of a room, reached only through the definer functions below. Unlogged, like private.ballot_boxes
-- and private.round_reactions: never in the WAL, so neither a replica, logical decoding nor a backup holds a pair of an
-- author and a text, and it cannot be published.
create unlogged table private.question_proposals (
  room_id uuid not null references public.rooms (id) on delete cascade,
  -- The proposal's handle within its room: max(number) + 1 under the room's lock. No time and no sequence, as in every
  -- table of schema private.
  number integer not null check (number >= 1),
  -- The author. A used proposal keeps it: the row is the limit's count. Removing the player deletes the row.
  player_id uuid not null references public.players (id) on delete cascade,
  -- private.question_text of what the player sent, as a question of private.game_questions; null once a leader decided.
  -- Waiting = text is not null.
  text text check (char_length(text) between 1 and 90),
  primary key (room_id, number)
);

-- The foreign key's lookups (removing a player) and the limit's count, without a scan of the table.
create index question_proposals_player_id on private.question_proposals (player_id);

alter table private.question_proposals enable row level security;

-- Reached only through the definer functions below, like the round tables.
revoke all on table private.question_proposals from public, anon, authenticated;

-- An entry approved from a proposal: it plays ahead of the rest of the list. It says nothing about who proposed it.
alter table private.game_questions add column proposed boolean not null default false;

-- The limit: no grants, called only from the definer functions below --------------------------------------------------

-- How many proposals the player may still send: 3 per player, whatever became of them. The one place with that number.
-- Stable, because room_lobby calls it too. The caller of a write holds the room's lock, so two proposals sent at once
-- take turns on the last one.
create function private.proposals_left(p_player_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select greatest(3 - count(*)::integer, 0)
  from private.question_proposals q
  where q.player_id = p_player_id
$$;

-- Player: propose a question ------------------------------------------------------------------------------------------

-- Definer, a public endpoint for any player of the room, in the lobby and while the game is in play. The player is the
-- host by auth.uid(), or a player of this room by the sha256 of p_player_token, as in set_player_color, so a signed-in
-- person who is a guest in another person's room is known by the token; a latecomer still waiting has no player row
-- yet. p_text follows the rule of add_own_question. { ok: true } and nothing else, also when the player has that text
-- waiting already (the form sent twice: no new row, and no proposal used up), or { ok: false, reason } with reason in
-- room_unknown (not a player of this room, or no room), room_closed, invalid_question_text (a raw text over 400
-- characters or a stored text outside 1-90 characters), proposal_limit (the player has used up their proposals). A
-- malformed token raises 22023. The answer never says anything about the leaders' decisions.
create function public.propose_question(p_room_id uuid, p_text text, p_player_token text default null)
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
  v_text text;
begin
  -- The server sends either no token (the host) or the cookie's 32-byte token; anything else is not our client.
  if p_player_token is not null and p_player_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'invalid player token' using errcode = '22023';
  end if;

  -- The room's row first: two proposals sent at once take turns on the limit and on the numbers, and the room closing
  -- right now either deletes this proposal or refuses it.
  select r.host_id, r.status into v_host, v_status
  from public.rooms r
  where r.id = p_room_id
  for update;

  if v_host is not null and v_user is not null and v_user = v_host then
    select p.id into v_player
    from public.players p
    where p.room_id = p_room_id and p.user_id = v_user;
  elsif v_host is not null and p_player_token is not null then
    select p.id into v_player
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

  -- A cap before the text rule, so its regular expressions never run on a very long text.
  if p_text is null or char_length(p_text) > 400 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_question_text');
  end if;

  v_text := private.question_text(p_text);
  if v_text is null or char_length(v_text) not between 1 and 90 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_question_text');
  end if;

  -- The form sent twice: the same text waiting from this player uses up no proposal, even the last one.
  if exists (
    select 1 from private.question_proposals q
    where q.room_id = p_room_id and q.player_id = v_player and q.text = v_text
  ) then
    return jsonb_build_object('ok', true);
  end if;

  if private.proposals_left(v_player) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'proposal_limit');
  end if;

  insert into private.question_proposals (room_id, number, player_id, text)
  select p_room_id, coalesce(max(q.number), 0) + 1, v_player, v_text
  from private.question_proposals q
  where q.room_id = p_room_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- Leader: approve or reject -------------------------------------------------------------------------------------------

-- Definer, the leader's: "Zatwierdź", once the game has started (decision 1). p_number is a number on the leader's
-- list. The text alone becomes a new entry at the end of the game's question list, with proposed = true, so it plays in
-- the next round, and the proposal's text is set to null. { ok: true } and nothing else, or { ok: false, reason } with
-- reason in room_unknown, not_leader (private.leader_refusal), room_closed, game_not_started (the lobby: the proposal
-- goes on waiting), proposal_unknown (no such proposal waiting: decided already, by another leader or a double click,
-- or its author removed), list_full (100 rows on the list: the proposal goes on waiting). A malformed token raises
-- 22023, in private.leader_refusal.
create function public.approve_proposal(p_room_id uuid, p_number integer, p_player_token text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host uuid;
  v_status text;
  v_refusal text;
  v_text text;
begin
  -- The room's row first: two leaders deciding at once take turns, and the second one finds nothing waiting.
  select r.host_id, r.status into v_host, v_status
  from public.rooms r
  where r.id = p_room_id
  for update;

  -- Only the room's leader decides; anyone else learns nothing about the room.
  v_refusal := private.leader_refusal(p_room_id, v_host, p_player_token);
  if v_refusal is not null then
    return jsonb_build_object('ok', false, 'reason', v_refusal);
  end if;

  if v_status = 'closed' then
    return jsonb_build_object('ok', false, 'reason', 'room_closed');
  end if;

  -- A row of the list in the lobby would pass for a reviewed list (the head of this file).
  if v_status <> 'playing' then
    return jsonb_build_object('ok', false, 'reason', 'game_not_started');
  end if;

  select q.text into v_text
  from private.question_proposals q
  where q.room_id = p_room_id and q.number = p_number and q.text is not null;

  if v_text is null then
    return jsonb_build_object('ok', false, 'reason', 'proposal_unknown');
  end if;

  if (select count(*) from private.game_questions g where g.room_id = p_room_id) >= 100 then
    return jsonb_build_object('ok', false, 'reason', 'list_full');
  end if;

  -- The text alone: the author stays behind, in the row that is deleted when the room closes.
  insert into private.game_questions (room_id, position, text, proposed)
  select p_room_id, coalesce(max(g.position), 0) + 1, v_text, true
  from private.game_questions g
  where g.room_id = p_room_id;

  update private.question_proposals q
  set text = null
  where q.room_id = p_room_id and q.number = p_number;

  return jsonb_build_object('ok', true);
end;
$$;

-- Definer, the leader's: "Odrzuć", with approve_proposal's checks but game_not_started and list_full: it works in the
-- lobby too, since it does not touch the list. The proposal's text is set to null, and the row stays as a used proposal
-- (decision 4), so the author's limit does not come back. { ok: true } and nothing else, or { ok: false, reason } with
-- reason in room_unknown, not_leader, room_closed, proposal_unknown. A malformed token raises 22023.
create function public.reject_proposal(p_room_id uuid, p_number integer, p_player_token text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host uuid;
  v_status text;
  v_refusal text;
begin
  -- The room's row first, as in approve_proposal.
  select r.host_id, r.status into v_host, v_status
  from public.rooms r
  where r.id = p_room_id
  for update;

  -- Only the room's leader decides; anyone else learns nothing about the room.
  v_refusal := private.leader_refusal(p_room_id, v_host, p_player_token);
  if v_refusal is not null then
    return jsonb_build_object('ok', false, 'reason', v_refusal);
  end if;

  if v_status = 'closed' then
    return jsonb_build_object('ok', false, 'reason', 'room_closed');
  end if;

  if not exists (
    select 1 from private.question_proposals q
    where q.room_id = p_room_id and q.number = p_number and q.text is not null
  ) then
    return jsonb_build_object('ok', false, 'reason', 'proposal_unknown');
  end if;

  update private.question_proposals q
  set text = null
  where q.room_id = p_room_id and q.number = p_number;

  return jsonb_build_object('ok', true);
end;
$$;

-- The next question, with the approved proposals first ----------------------------------------------------------------

-- Opens round p_number of the room, with an empty urn: the list's first entry that is not removed and has no round yet,
-- the approved proposals before the rest and, among each, in the order of positions; after the list, the first
-- candidate, in the given order, that has the question id format, was not played in this room yet and is on no row of
-- the list (removed and reworded entries included). Checked before the insert, so a repeat is never a 23505 with the
-- row's values in DETAIL. Who may vote: the players in the room now, in seat order. false when nothing is left; nothing
-- is written then. The caller holds the room's lock and has checked the room and its latest round.
-- More than 1000 candidates raises an exception, not a refusal, also while the list lasts: the game sends at most 216
-- ids, so such a list is malformed input from a client calling the database directly, as a malformed player token is.
-- The exception also rolls back what the caller wrote before the call (the urn skip_round deletes), and its message
-- holds no value of the list.
create or replace function private.open_next_round(p_room_id uuid, p_number integer, p_candidates text[])
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_position integer;
  v_question text;
  v_eligible uuid[];
  v_round uuid;
begin
  if coalesce(cardinality(p_candidates), 0) > 1000 then
    raise exception 'too many candidates' using errcode = '22023';
  end if;

  -- The list first, the approved proposals ahead of the rest of it (S-10). The entry's question id only when it has no
  -- text of its own.
  select g.position, case when g.text is null then g.question_id end into v_position, v_question
  from private.game_questions g
  where g.room_id = p_room_id
    and not g.removed
    and not exists (
      select 1 from private.rounds r where r.room_id = p_room_id and r.list_position = g.position
    )
  order by g.proposed desc, g.position
  limit 1;

  if v_position is null then
    select c.question_id into v_question
    from unnest(p_candidates) with ordinality as c (question_id, place)
    where c.question_id ~ '^[a-z0-9-]+-[0-9]{3}$'
      and not exists (
        select 1 from private.rounds r where r.room_id = p_room_id and r.question_id = c.question_id
      )
      and not exists (
        select 1 from private.game_questions g where g.room_id = p_room_id and g.question_id = c.question_id
      )
    order by c.place
    limit 1;

    if v_question is null then
      return false;
    end if;
  end if;

  select array_agg(p.id order by p.seat) into v_eligible
  from public.players p
  where p.room_id = p_room_id;

  insert into private.rounds (room_id, number, question_id, list_position, eligible)
  values (p_room_id, p_number, v_question, v_position, v_eligible)
  returning id into v_round;

  insert into private.ballot_boxes (round_id) values (v_round);

  return true;
end;
$$;

-- Cleaning up ---------------------------------------------------------------------------------------------------------

-- Everything a game in play keeps apart from its players, dropped whenever the room closes (end_game, "Nowa gra" in
-- create_room, private.close_stale_games): the urn of a round that ends without a reveal, so no voter and no count
-- stays (D1 of S-02), the room's requests to join, pending or rejected, and its proposals, waiting or used, so no pair
-- of an author and a text stays (S-10). Results already revealed and the approved questions, which have no author,
-- stay. Never at a reveal: a request and a proposal wait for a leader's answer through every round. S-11: the thumbs
-- are folded first.
create or replace function private.drop_round_state(p_room_id uuid)
returns void
language sql
set search_path = ''
as $$
  -- S-11: the thumbs of the room's last reveal go into the counters, and go.
  select private.fold_reactions(p_room_id);

  delete from private.round_voters v
  using private.rounds r
  where r.id = v.round_id and r.room_id = p_room_id;

  delete from private.ballot_boxes b
  using private.rounds r
  where r.id = b.round_id and r.room_id = p_room_id;

  delete from public.join_requests q
  where q.room_id = p_room_id;
$$;

-- Definer, owned by postgres, no grants: only the cron job and the owner run it. The room's row first, as in every
-- round function; a room locked by a vote in progress is skipped and closed an hour later. S-10: a room left in the
-- lobby never closes by itself, so a second loop deletes the proposals of every lobby created more than 12 hours ago,
-- used ones included, under the same lock; the room stays in the lobby, and one skipped here goes an hour later. Raises
-- nothing of its own, so no row's values reach cron.job_run_details, which keeps the text of any error.
create or replace function private.close_stale_games()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room uuid;
begin
  for v_room in
    select r.id
    from public.rooms r
    where r.status = 'playing' and r.started_at < now() - interval '12 hours'
    for update skip locked
  loop
    update public.rooms set status = 'closed' where id = v_room;
    perform private.drop_round_state(v_room);
  end loop;

  for v_room in
    select r.id
    from public.rooms r
    where r.status = 'lobby' and r.created_at < now() - interval '12 hours'
    for update skip locked
  loop
    delete from private.question_proposals q where q.room_id = v_room;
  end loop;
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
-- a closed room with no revealed round. proposals (S-10): the proposals waiting, as { number, nick, text } in the order
-- of numbers, for a leader, in every status; [] for anyone else, and none once the room is closed. own_proposals
-- (S-10): for every player, in every status, how many proposals they may still send (left) and how many of theirs wait
-- (waiting); never how a decided one was decided. A question approved in a game with no list makes that game have one:
-- list_entries counts it too, list_base_count does not, since it has no question id, and the host's question_list stops
-- being null with the first approval. The Worker gives a screen the list only in the lobby, so nothing shows it.
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
  v_proposals jsonb := '[]'::jsonb;
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

  -- S-10: only a leader decides on a proposal, so only a leader sees its text and who sent it (decision 3): anyone else
  -- learns a question when its round opens, and never who proposed it.
  if true then
    select coalesce(
      jsonb_agg(jsonb_build_object('number', q.number, 'nick', p.nick, 'text', q.text) order by q.number),
      '[]'::jsonb
    )
    into v_proposals
    from private.question_proposals q
    join public.players p on p.id = q.player_id
    where q.room_id = p_room_id and q.text is not null;
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
    'game_totals', v_game_totals,
    -- S-10: the text and its author, a leader's only.
    'proposals', v_proposals,
    -- S-10: the player's own counts, with no text and nothing about a decision (decision 5).
    'own_proposals', jsonb_build_object(
      'left', private.proposals_left(v_me_id),
      'waiting', (
        select count(*)::integer
        from private.question_proposals q
        where q.player_id = v_me_id and q.text is not null
      )
    )
  );
end;
$$;

-- Function owners and grants ------------------------------------------------------------------------------------------

-- A security definer function runs with its owner's rights; on Supabase that must be postgres. The helper too, as
-- private.free_color in *_player_color_choice.sql: the definer functions call it as postgres.
alter function private.proposals_left(uuid) owner to postgres;
alter function private.open_next_round(uuid, integer, text[]) owner to postgres;
alter function private.drop_round_state(uuid) owner to postgres;
alter function private.close_stale_games() owner to postgres;
alter function public.propose_question(uuid, text, text) owner to postgres;
alter function public.approve_proposal(uuid, integer, text) owner to postgres;
alter function public.reject_proposal(uuid, integer, text) owner to postgres;
alter function public.room_lobby(uuid, text) owner to postgres;

-- As in *_rejoin_after_refresh.sql: create or replace keeps a function's grants, and the revokes are repeated for every
-- function this file creates or replaces, so each one's grants read in one place. The private functions get none: only
-- definer functions and the cron job call them.
revoke execute on function private.proposals_left(uuid) from public, anon, authenticated;
revoke execute on function private.open_next_round(uuid, integer, text[]) from public, anon, authenticated;
revoke execute on function private.drop_round_state(uuid) from public, anon, authenticated;
revoke execute on function private.close_stale_games() from public, anon, authenticated;
revoke execute on function public.propose_question(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.approve_proposal(uuid, integer, text) from public, anon, authenticated;
revoke execute on function public.reject_proposal(uuid, integer, text) from public, anon, authenticated;
revoke execute on function public.room_lobby(uuid, text) from public, anon, authenticated;

-- A guest has no session, and neither has a co-host: proposing and the leader's answers are public endpoints, with
-- every check inside, like the vote and the leader's other moves. The room's state stays readable by its guests.
grant execute on function public.propose_question(uuid, text, text) to anon, authenticated;
grant execute on function public.approve_proposal(uuid, integer, text) to anon, authenticated;
grant execute on function public.reject_proposal(uuid, integer, text) to anon, authenticated;
grant execute on function public.room_lobby(uuid, text) to anon, authenticated;
