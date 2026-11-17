-- TEMPORARY break-check (test-plan §6.2) of the security-hardening implementation review, F1: start_game opens round 1
-- from p_question_id again when there is no list and no pool. Reverted right after CI; never db push this file.

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
    -- ALARM: the old way in of S-17 back (20261115095052_no_recent_repeats.sql:187-193).
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
