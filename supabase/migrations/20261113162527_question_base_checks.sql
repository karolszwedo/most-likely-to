-- S-17 question-pool-in-db: the leader's moves open only a question of the host's choice
-- (context/changes/question-pool-in-db/plan.md, Faza 2 #1; PRD FR-005; Karol's decisions of 2026-11-13 at the top of
-- that plan).
--
-- Until now the database checked only the format of a question id it was sent, and the host's choice (rooms.categories
-- and rooms.adult_categories) only the Worker did (poolFrom, src/lib/rounds/draw.ts). A leader calling the database
-- directly, a co-host with the token of its cookie or the host with its session, could open any question of the base,
-- or an 18+ one the host left out (known hole F1 of context/changes/co-host-role/reviews/plan-review.md), and play any
-- id in the format into the counters of private.question_stats (risk 8 of
-- context/archive/2026-10-26-question-reactions-play-data/research.md).
--
-- private.picked_candidates holds the rule of FR-005 in one place, the same as poolFrom's: a candidate passes when
-- private.question_base (*_question_base.sql, filled by the snapshots of `npm run questions:migration`) has its id, its
-- category is one of the room's categories and, for an 18+ question, one of the room's 18+ categories too. The base's
-- own check is the id's format, so an id in another format, a null included, never passes; a category name the base
-- does not know adds nothing. Every way a question id comes into a round or onto the game's question list goes
-- through it:
--   - private.unplayed_candidates, and with it next_round, skip_round and more_questions (private.open_next_round) and
--     the count of "Jeszcze 5 pytań": a candidate outside the choice drops out, as one in another format did, and the
--     rest of the Worker's order still counts; nothing left is no_questions, as before;
--   - start_game with no list: an id outside the choice is invalid_question, which the screen shows as "Nie udało się
--     wylosować pytania. Spróbuj jeszcze raz.", and the next "Zacznij grę" draws again; with a list, p_question_id
--     still means nothing;
--   - open_question_list and draw_list_question: the first 15 distinct candidates that pass, and the first one that
--     passes and is on no row of the list; no_questions when none does.
-- An entry of the list with no question id (an own, reworded or approved question) carries no id to check, and every
-- entry with one came through the two list functions.
--
-- create_room: besides the shape of the choice, every name in p_categories must be the category of a row of
-- private.question_base, else invalid_categories, checked before the host's open room is closed, as the shape is.
--
-- The same signatures, refusal codes, owners and grants: each function is replaced (create or replace) from its latest
-- definition with only the check changed: start_game from *_co_host_role.sql, open_question_list and
-- draw_list_question from *_question_list_review.sql, create_room from *_player_color_choice.sql and
-- private.unplayed_candidates from *_game_length.sql. The limit of 1000 candidates (22023) stays where it was. This
-- file only reads private.question_base: the snapshots alone write it (tests/unit/question-base-snapshot.test.ts).
--
-- Deployment order (plan, Critical Implementation Details and Faza 3): this migration ships after the snapshot that
-- fills private.question_base, in the same push, and before the merge of the Worker's change; with an empty base every
-- move would answer no_questions or invalid_question. The Worker deployed before it sends only ids of its own pool,
-- which the base holds, and gets the same answers, so no screen changes. A question added to src/data/questions.ts
-- reaches a game only once its snapshot is pushed.
--
-- Never edit this file once it has been pushed; a fix is a new migration.

-- The host's choice: no grants, called only from the definer functions below ----------------------------------------

-- The candidates of the room's choice, with their place in the given order: an id of private.question_base, of one of
-- the room's categories, and 18+ only from one of its 18+ categories (FR-005, as poolFrom in src/lib/rounds/draw.ts). A
-- candidate given twice stays twice, each at its own place, as unnest gives it. The one definition for
-- private.unplayed_candidates, start_game, open_question_list and draw_list_question. Stable: it only reads.
create function private.picked_candidates(p_room_id uuid, p_candidates text[])
returns table (question_id text, place bigint)
language sql
stable
set search_path = ''
as $$
  select c.question_id, c.place
  from unnest(p_candidates) with ordinality as c (question_id, place)
  join private.question_base b on b.question_id = c.question_id
  join public.rooms r on r.id = p_room_id
  where b.category = any (r.categories)
    and (not b.adult or b.category = any (r.adult_categories))
$$;

-- The candidates that may open a round once the list is played, with their place in the given order: of the room's
-- choice (private.picked_candidates), not played in this room yet and on no row of its list (removed and reworded
-- entries included). The one definition for private.open_next_round, which takes the first of them, and more_questions,
-- which counts them. Stable: it only reads. S-17: the choice instead of the id's format.
create or replace function private.unplayed_candidates(p_room_id uuid, p_candidates text[])
returns table (question_id text, place bigint)
language sql
stable
set search_path = ''
as $$
  select c.question_id, c.place
  from private.picked_candidates(p_room_id, p_candidates) c
  where not exists (
      select 1 from private.rounds r where r.room_id = p_room_id and r.question_id = c.question_id
    )
    and not exists (
      select 1 from private.game_questions g where g.room_id = p_room_id and g.question_id = c.question_id
    )
$$;

-- Host: new room ------------------------------------------------------------------------------------------------------

-- Definer now (F1): the host has no write grant of its own. Closes the host's open room, a game in play included (asks
-- first when guests are in it), drops its round's in-progress state, then opens a new one with the host as player 1, in
-- one transaction. p_link_token is ignored: the code is made here. S-18: the host takes the new room's first free
-- colour, 0. S-17: every picked category is one of the shared question base, else invalid_categories, before anything
-- is closed.
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

  -- S-17: and every name the category of a row of the shared question base, as the Worker checks it
  -- (src/pages/api/rooms/index.ts): a name the base does not have would pick no question.
  if coalesce(cardinality(p_categories), 0) < 1
    or array_position(p_categories, null) is not null
    or not (coalesce(p_adult_categories, '{}') <@ p_categories)
    or not (p_categories <@ array(select b.category from private.question_base b)) then
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

-- Leader: start -------------------------------------------------------------------------------------------------------

-- Definer, the leader's (the host, or a co-host by p_player_token): "Zacznij grę". Fixes who may vote (everyone in the
-- room now, the host included; at least 3, US-01) and opens round 1 with its urn. With a list, round 1 is its first
-- entry not removed, and p_question_id means nothing: list_empty when every entry is removed. With no list, round 1 is
-- p_question_id. S-11: right before round 1 opens, the list as it stands is counted. S-17: with no list, p_question_id
-- must be a question of the room's choice (private.picked_candidates), else invalid_question; null is none.
create or replace function public.start_game(p_room_id uuid, p_question_id text, p_player_token text default null)
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
-- order. The first 15 distinct candidates of the room's choice (private.picked_candidates; S-17, before it the id's
-- format), in that order, become positions 1-15. A list that has rows already stays as it is and the answer is ok (a
-- double click, the host's second screen); no_questions when no candidate is usable, and nothing is written then.
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

  -- A repeated candidate counts once, at its first place.
  select array_agg(d.question_id order by d.first_place) into v_questions
  from (
    select c.question_id, min(c.place) as first_place
    from private.picked_candidates(p_room_id, p_candidates) c
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

-- Definer, host only: "Dolosuj pytanie". The first candidate, in the given order, of the room's choice
-- (private.picked_candidates; S-17, before it the id's format) and on no row of the list (removed and reworded entries
-- included) becomes a new entry at the end. list_full at 100 rows; no_questions when no candidate is left, and nothing
-- is written then.
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
  from private.picked_candidates(p_room_id, p_candidates) c
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
-- private.unplayed_candidates in *_game_length.sql: the definer functions call them as postgres.
alter function private.picked_candidates(uuid, text[]) owner to postgres;
alter function private.unplayed_candidates(uuid, text[]) owner to postgres;
alter function public.create_room(text, text, text[], text[], boolean) owner to postgres;
alter function public.start_game(uuid, text, text) owner to postgres;
alter function public.open_question_list(uuid, text[]) owner to postgres;
alter function public.draw_list_question(uuid, text[]) owner to postgres;

-- As in *_game_length.sql: create or replace keeps a function's grants, and the revokes are repeated for every function
-- this file creates or replaces, so each one's grants read in one place. The private helpers get none: only definer
-- functions call them.
revoke execute on function private.picked_candidates(uuid, text[]) from public, anon, authenticated;
revoke execute on function private.unplayed_candidates(uuid, text[]) from public, anon, authenticated;
revoke execute on function public.create_room(text, text, text[], text[], boolean) from public, anon, authenticated;
revoke execute on function public.start_game(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.open_question_list(uuid, text[]) from public, anon, authenticated;
revoke execute on function public.draw_list_question(uuid, text[]) from public, anon, authenticated;

-- The same grants as before for the functions replaced here: creating a room and the list are the signed-in host's; a
-- co-host is a guest with no session, so the start stays a public endpoint like the leader's other moves, with every
-- check inside.
grant execute on function public.create_room(text, text, text[], text[], boolean) to authenticated;
grant execute on function public.start_game(uuid, text, text) to anon, authenticated;
grant execute on function public.open_question_list(uuid, text[]) to authenticated;
grant execute on function public.draw_list_question(uuid, text[]) to authenticated;
