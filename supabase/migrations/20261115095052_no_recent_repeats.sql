-- S-20 no-recent-repeats: the game draws first the questions the host does not know from its other games, and only
-- then the ones it knows, the longest known first, like a deck whose played cards go to the bottom
-- (context/changes/no-recent-repeats/plan.md, Faza 1; PRD FR-015 and Open Question 5; Karol's decisions 1-5 of
-- 2026-11-15 at the top of that plan).
--
-- A question the host knows is a question id of private.rounds or of private.game_questions of another room of the same
-- host (rooms.host_id), in any status: every round, a skipped one and one ended without a reveal included (decision 3),
-- and every row of the game's question list, removed and reworded entries included, also of a room closed in the lobby
-- (decision 4). The host knows it since the latest of those rooms, by coalesce(started_at, created_at), as host_games
-- orders the host's games (*_host_game_history.sql). Every game of the host counts, with no limit (decision 2); a game
-- deleted with delete_game takes its rounds and its list with it, so it stops counting (decision 5). The room drawn for
-- is never its own history: its rounds and its list keep their questions out of the draw as before, in the callers.
--
-- private.ordered_candidates holds the order in one place, as private.picked_candidates holds the host's choice: every
-- row of picked_candidates (a candidate given twice too), its place renumbered from 1 in the order of the draw: first
-- the questions the host does not know, in the Worker's order; then the known ones, the longest known first; on a tie,
-- the Worker's order. No candidate drops out, so every count stays as it was: the 15 of the list, "Jeszcze 5 pytań"
-- and the Worker's questionsToDraw. Every draw goes through it:
--   - open_question_list: the first 15 distinct candidates in that order become positions 1-15, so the fresh questions
--     take the first positions and the known ones the last, with no shuffle of their own;
--   - draw_list_question: the first candidate in that order on no row of the list; list_full is still checked before
--     any candidate is looked at;
--   - private.unplayed_candidates: the same signature and the same filter, with the place in that order. So
--     private.open_next_round (next_round, skip_round, more_questions), which takes its first candidate by place, and
--     more_questions, which counts its rows, stay as *_game_length.sql defines them;
--   - start_game with no list: given p_candidates, round 1 is the first of them in that order.
--
-- start_game gets p_candidates text[] default null as its last argument, and p_question_id a default of null; the old
-- version (uuid, text, text) is dropped, so there is one version, as of every move of the leader. With no list and with
-- p_candidates, round 1 is the first candidate in the order of the draw, and no_questions (a refusal the screens know
-- already, src/lib/rooms/errors.ts) when none is of the room's choice, with nothing written; with no list and no
-- p_candidates, p_question_id is checked as before (invalid_question, null included); with a list, neither means
-- anything. More than 1000 candidates raise 22023, as in the other draws.
--
-- The index rooms_by_host: the history reads every room of the host, the closed ones included, which the partial unique
-- index of the open rooms (*_first_live_round.sql) does not hold.
--
-- Deployment order (plan, Critical Implementation Details and Faza 3): this migration ships before the Worker's change.
-- The Worker deployed before it calls start_game with p_room_id, p_question_id and p_player_token by name, which the
-- new version takes, with p_candidates at its default, and answers as before; its lists, draws and next questions take
-- the new order from the push on. The new Worker sends p_room_id, p_candidates and p_player_token.
--
-- The history is question ids of rounds and lists, and the time of a room: nothing here names a vote or a voter.
--
-- Never edit this file once it has been pushed; a fix is a new migration.

-- The host's games ---------------------------------------------------------------------------------------------------

-- Every room of a host, the closed ones included, for private.ordered_candidates.
create index rooms_by_host on public.rooms (host_id);

-- The order of the draw: no grants, called only from the definer functions below -----------------------------------

-- The candidates of the room's choice (private.picked_candidates), each of its rows kept, with place renumbered from 1
-- in the order of the draw: first the questions the room's host does not know from its other rooms, in the given order;
-- then the known ones by when the host last met one (coalesce(started_at, created_at) of the latest such room), the
-- longest known first; on a tie, the given order. Known: the question id of a round or of a row of the list of another
-- room of the same host, in any status. The one definition for private.unplayed_candidates, start_game,
-- open_question_list and draw_list_question. Stable: it only reads.
create function private.ordered_candidates(p_room_id uuid, p_candidates text[])
returns table (question_id text, place bigint)
language sql
stable
set search_path = ''
as $$
  with known as (
    select k.question_id, max(coalesce(o.started_at, o.created_at)) as known_at
    from public.rooms r
    join public.rooms o on o.host_id = r.host_id and o.id <> r.id
    cross join lateral (
      select x.question_id from private.rounds x where x.room_id = o.id and x.question_id is not null
      union
      select g.question_id from private.game_questions g where g.room_id = o.id and g.question_id is not null
    ) k
    where r.id = p_room_id
    group by k.question_id
  )
  select c.question_id, row_number() over (order by k.known_at nulls first, c.place) as place
  from private.picked_candidates(p_room_id, p_candidates) c
  left join known k on k.question_id = c.question_id
$$;

-- The candidates that may open a round once the list is played, with their place in the order of the draw (S-20,
-- private.ordered_candidates; before it, the given order): of the room's choice, not played in this room yet and on no
-- row of its list (removed and reworded entries included). The one definition for private.open_next_round, which takes
-- the first of them by place, and more_questions, which counts them: the order loses no candidate, so the count stays
-- the same. Stable: it only reads.
create or replace function private.unplayed_candidates(p_room_id uuid, p_candidates text[])
returns table (question_id text, place bigint)
language sql
stable
set search_path = ''
as $$
  select c.question_id, c.place
  from private.ordered_candidates(p_room_id, p_candidates) c
  where not exists (
      select 1 from private.rounds r where r.room_id = p_room_id and r.question_id = c.question_id
    )
    and not exists (
      select 1 from private.game_questions g where g.room_id = p_room_id and g.question_id = c.question_id
    )
$$;

-- Leader: start -------------------------------------------------------------------------------------------------------

-- One version only: the new one below takes the old one's calls by name.
drop function public.start_game(uuid, text, text);

-- Definer, the leader's (the host, or a co-host by p_player_token): "Zacznij grę". Fixes who may vote (everyone in the
-- room now, the host included; at least 3, US-01) and opens round 1 with its urn. With a list, round 1 is its first
-- entry not removed, and p_question_id and p_candidates mean nothing: list_empty when every entry is removed. With no
-- list and with p_candidates (S-20), the game's pool in the Worker's order, round 1 is the first of them in the order
-- of the draw (private.ordered_candidates), and no_questions when none is of the room's choice, with nothing written;
-- then p_question_id means nothing. With no list and no p_candidates, round 1 is p_question_id, which must be a
-- question of the room's choice (S-17, private.picked_candidates), else invalid_question; null is none. The Worker
-- sends p_candidates since S-20; the Worker deployed before it, and the tests that fix the first question, send
-- p_question_id. More than 1000 candidates raise 22023 before anything is written, with no value of the list in the
-- message. S-11: right before round 1 opens, the list as it stands is counted.
create function public.start_game(
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
    -- S-17: a question of the room's choice, which also has the id's format.
    if not exists (select 1 from private.picked_candidates(p_room_id, array[p_question_id])) then
      return jsonb_build_object('ok', false, 'reason', 'invalid_question');
    end if;
    v_question := p_question_id;
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

-- Host: the list in the lobby -----------------------------------------------------------------------------------------

-- Definer, host only: "Przejrzyj pytania". p_candidates is the pool of the picked categories in the Worker's random
-- order. The first 15 distinct candidates in the order of the draw (S-20, private.ordered_candidates: of the room's
-- choice, the questions the host does not know from its other games first, then the known ones, the longest known
-- first) become positions 1-15. A list that has rows already stays as it is and the answer is ok (a double click, the
-- host's second screen); no_questions when no candidate is usable, and nothing is written then.
create or replace function public.open_question_list(p_room_id uuid, p_candidates text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_host uuid;
  v_status text;
  v_questions text[];
begin
  -- The room's row first: a start or another move of the host right now waits for this one.
  select r.host_id, r.status into v_host, v_status
  from public.rooms r
  where r.id = p_room_id
  for update;

  -- Another host's room looks like no room at all.
  if v_host is null or v_user is null or v_user <> v_host then
    return jsonb_build_object('ok', false, 'reason', 'room_unknown');
  end if;

  if v_status = 'closed' then
    return jsonb_build_object('ok', false, 'reason', 'room_closed');
  end if;

  -- The list is reviewed before the start only.
  if v_status <> 'lobby' then
    return jsonb_build_object('ok', false, 'reason', 'game_started');
  end if;

  if exists (select 1 from private.game_questions g where g.room_id = p_room_id) then
    return jsonb_build_object('ok', true);
  end if;

  -- The game sends at most 216 ids; a longer list is malformed input, as in private.open_next_round.
  if coalesce(cardinality(p_candidates), 0) > 1000 then
    raise exception 'too many candidates' using errcode = '22023';
  end if;

  -- A repeated candidate counts once, at its first place in the order of the draw (both of its rows share one time
  -- the host knows it from, so its first place is that of its first row given).
  select array_agg(d.question_id order by d.first_place) into v_questions
  from (
    select c.question_id, min(c.place) as first_place
    from private.ordered_candidates(p_room_id, p_candidates) c
    group by c.question_id
    order by first_place
    limit 15
  ) d;

  if v_questions is null then
    return jsonb_build_object('ok', false, 'reason', 'no_questions');
  end if;

  insert into private.game_questions (room_id, position, question_id)
  select p_room_id, q.place::integer, q.question_id
  from unnest(v_questions) with ordinality as q (question_id, place);

  return jsonb_build_object('ok', true);
end;
$$;

-- Definer, host only: "Dolosuj pytanie". The first candidate in the order of the draw (S-20,
-- private.ordered_candidates: of the room's choice, the questions the host does not know from its other games first)
-- on no row of the list (removed and reworded entries included) becomes a new entry at the end. list_full at 100 rows,
-- checked before any candidate is looked at; no_questions when no candidate is left, and nothing is written then.
create or replace function public.draw_list_question(p_room_id uuid, p_candidates text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_host uuid;
  v_status text;
  v_question text;
begin
  -- The room's row first, as in open_question_list.
  select r.host_id, r.status into v_host, v_status
  from public.rooms r
  where r.id = p_room_id
  for update;

  -- Another host's room looks like no room at all.
  if v_host is null or v_user is null or v_user <> v_host then
    return jsonb_build_object('ok', false, 'reason', 'room_unknown');
  end if;

  if v_status = 'closed' then
    return jsonb_build_object('ok', false, 'reason', 'room_closed');
  end if;

  if v_status <> 'lobby' then
    return jsonb_build_object('ok', false, 'reason', 'game_started');
  end if;

  if (select count(*) from private.game_questions g where g.room_id = p_room_id) >= 100 then
    return jsonb_build_object('ok', false, 'reason', 'list_full');
  end if;

  if coalesce(cardinality(p_candidates), 0) > 1000 then
    raise exception 'too many candidates' using errcode = '22023';
  end if;

  select c.question_id into v_question
  from private.ordered_candidates(p_room_id, p_candidates) c
  where not exists (
      select 1 from private.game_questions g where g.room_id = p_room_id and g.question_id = c.question_id
    )
  order by c.place
  limit 1;

  if v_question is null then
    return jsonb_build_object('ok', false, 'reason', 'no_questions');
  end if;

  insert into private.game_questions (room_id, position, question_id)
  select p_room_id, coalesce(max(g.position), 0) + 1, v_question
  from private.game_questions g
  where g.room_id = p_room_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- Function owners and grants ------------------------------------------------------------------------------------------

-- A security definer function runs with its owner's rights; on Supabase that must be postgres. The helpers too, as
-- private.picked_candidates in *_question_base_checks.sql: the definer functions call them as postgres.
alter function private.ordered_candidates(uuid, text[]) owner to postgres;
alter function private.unplayed_candidates(uuid, text[]) owner to postgres;
alter function public.start_game(uuid, text, text, text[]) owner to postgres;
alter function public.open_question_list(uuid, text[]) owner to postgres;
alter function public.draw_list_question(uuid, text[]) owner to postgres;

-- As in *_question_base_checks.sql: create or replace keeps a function's grants, and the revokes are repeated for every
-- function this file creates or replaces, so each one's grants read in one place. The private helpers get none: only
-- definer functions call them.
revoke execute on function private.ordered_candidates(uuid, text[]) from public, anon, authenticated;
revoke execute on function private.unplayed_candidates(uuid, text[]) from public, anon, authenticated;
revoke execute on function public.start_game(uuid, text, text, text[]) from public, anon, authenticated;
revoke execute on function public.open_question_list(uuid, text[]) from public, anon, authenticated;
revoke execute on function public.draw_list_question(uuid, text[]) from public, anon, authenticated;

-- The same grants as before: the list is the signed-in host's; a co-host is a guest with no session, so the start stays
-- a public endpoint like the leader's other moves, with every check inside.
grant execute on function public.start_game(uuid, text, text, text[]) to anon, authenticated;
grant execute on function public.open_question_list(uuid, text[]) to authenticated;
grant execute on function public.draw_list_question(uuid, text[]) to authenticated;
