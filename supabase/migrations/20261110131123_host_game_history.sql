-- S-13 host-game-history: the signed-in host sees a minimal list of its ended games and deletes any of them, and a
-- guest of a deleted game learns that the game is gone (context/changes/host-game-history/plan.md, Faza 1; PRD FR-019;
-- Karol's decisions 1-7 of 2026-11-10 at the top of that plan).
--
-- host_games, the host's: its closed rooms, newest first by the start of the game or, for a room closed in the lobby,
-- by its creation; each as { id, created_at, started_at, questions, nicks }. started_at is null for a game that never
-- started. questions is the number of the room's rounds, the skipped ones and a round ended without a reveal included:
-- the last "Pytanie N" everyone saw (decision 3). nicks are the players' nicks in seat order, the host's included; a
-- player removed during the game (S-09) is not there. Nothing about votes, results, colours or roles.
--
-- delete_game, the host's: deletes one of its ended games with everything tied to it. Decision 1: only a closed game;
-- the host ends an open one first ("Zakończ grę" or "Nowa gra"). The write is one delete of the room's row, and the
-- foreign keys to the room, its players and its rounds, every one of them on delete cascade, take the rest in the same
-- statement: players, player_secrets, join_requests (the traces of S-04 included), rounds, round_results, the urn and
-- the thumbs (empty in a closed room: every closing runs private.drop_round_state, which folds the thumbs first),
-- question_proposals and the game's question list, private.game_questions. Decision 2: the list goes with the game,
-- with the approved proposals and the host's own questions, also before the game's creator has reviewed them (FR-021,
-- context/deployment/deploy-plan.md).
--
-- The one key without on delete, private.rounds (room_id, list_position) -> private.game_questions
-- (*_question_list_review.sql), is NO ACTION and not deferrable, so it is checked at the end of the statement, once the
-- cascade has taken the rounds as well: the rounds and the list go in one statement, never the list on its own first,
-- which that key would refuse (review of S-06, F2; pinned by the pgTAP scenario with a round from the list).
--
-- What stays: private.question_stats, the anonymous counters of the questions (S-11), with no key to a room, a round or
-- a player, and private.stats_excluded_hosts, which names hosts, not games. Deleting a game changes neither, and the
-- confirmation on the host's screen says so (decision 7).
--
-- join_request_state (same signature, create or replace, from its latest definition in *_rejoin_after_refresh.sql with
-- only the branch of a missing room and its comment changed): a well-formed token for a room that does not exist gets
-- { state: "gone" } instead of none, which /r/<id> reads as "removed" (S-09), so a guest of a deleted game is told the
-- game is gone, not that they were removed (decision 5; risk F6 of the review of S-09). A malformed token still gets
-- none, checked first.
--
-- Deployment order (plan, Critical Implementation Details): this migration ships before the Worker that uses it. For
-- the Worker deployed before it, it only adds: host_games and delete_game are functions nobody calls yet, and gone,
-- which that Worker does not know, comes only with the cookie of a room that no longer exists; until the merge only
-- the smoke run on the dev server deletes games, the smoke account's, whose rooms nobody opens.
--
-- Never edit this file once it has been pushed; a fix is a new migration.

-- Host: the list of its ended games -----------------------------------------------------------------------------------

-- Definer, the signed-in host's: its ended games (status closed) for the list "Twoje gry", newest first by
-- coalesce(started_at, created_at), then by id. A definer function because the number of questions lives in
-- private.rounds, which no API role reaches; every row it reads belongs to a room of the caller (rooms.host_id =
-- auth.uid()). No caller: []. Writes nothing.
create function public.host_games()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'created_at', r.created_at,
        'started_at', r.started_at,
        'questions', (select count(*) from private.rounds x where x.room_id = r.id),
        'nicks', coalesce(
          (select jsonb_agg(p.nick order by p.seat) from public.players p where p.room_id = r.id),
          '[]'::jsonb
        )
      )
      order by coalesce(r.started_at, r.created_at) desc, r.id
    ),
    '[]'::jsonb
  )
  from public.rooms r
  where r.host_id = (select auth.uid()) and r.status = 'closed'
$$;

-- Host: delete an ended game ------------------------------------------------------------------------------------------

-- Definer, the signed-in host's: "Usuń" on its list of games. Deletes the room and, by the foreign keys, everything
-- tied to it (the head of this file). { ok: true } and nothing else, or { ok: false, reason } with reason in
-- room_unknown (no such room, another host's room, or no caller: a game deleted already looks like no game at all) and
-- game_not_ended (the lobby or a game in play: decision 1). Every refusal comes before the one write.
create function public.delete_game(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_host uuid;
  v_status text;
begin
  -- The room's row first: a second "Usuń" of the same game right now (another tab) waits for this one and then finds
  -- no room.
  select r.host_id, r.status into v_host, v_status
  from public.rooms r
  where r.id = p_room_id
  for update;

  -- Only the host deletes its games. Another host's room looks like no room at all.
  if v_host is null or v_user is null or v_user <> v_host then
    return jsonb_build_object('ok', false, 'reason', 'room_unknown');
  end if;

  -- Decision 1: only an ended game. The host ends an open one first, so nobody is playing in a room that disappears.
  if v_status <> 'closed' then
    return jsonb_build_object('ok', false, 'reason', 'game_not_ended');
  end if;

  -- One statement: the cascade takes the rounds and the game's question list together (the head of this file).
  delete from public.rooms where id = p_room_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- Latecomer or guest coming back: how one's own request stands (only the missing room changed) -----------------------

-- Definer, for anon and authenticated: how the token's own request stands, for the waiting screen and the room page;
-- writes nothing. { state: "admitted" } once the token is a player of the room; { state: "closed" } once the room is
-- closed (its requests went with it); { state: "pending" | "rejected", nick } for the token's request in the room, with
-- returning: true added when it asks to come back to a place (S-04); { state: "moved", nick } for a token whose place
-- moved to another token by a leader's "Wpuść" (S-04); { state: "gone" } for a well-formed token and a room that does
-- not exist, which is what a guest of a game its host deleted gets (S-13); { state: "none" } otherwise: a malformed
-- token, or a token with nothing in this room. Never the question, the players or anyone else's request: whoever is
-- outside sees nothing of the game.
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

  -- S-13: no room, so a game its host deleted (delete_game); the page tells such a guest the game is gone, not that
  -- they were removed.
  if v_status is null then
    return jsonb_build_object('state', 'gone');
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

-- Function owners and grants ------------------------------------------------------------------------------------------

-- A security definer function runs with its owner's rights; on Supabase that must be postgres.
alter function public.host_games() owner to postgres;
alter function public.delete_game(uuid) owner to postgres;
alter function public.join_request_state(uuid, text) owner to postgres;

-- As in *_rejoin_after_refresh.sql: create or replace keeps a function's grants, and the revokes are repeated for every
-- function this file creates or replaces, so each one's grants read in one place.
revoke execute on function public.host_games() from public, anon, authenticated;
revoke execute on function public.delete_game(uuid) from public, anon, authenticated;
revoke execute on function public.join_request_state(uuid, text) from public, anon, authenticated;

-- The list and the deletion are the signed-in host's, with the host checked inside (PRD Access Control: a co-host has
-- no host's panel). The one who asks to join or come back has no session, so a request's state stays a public endpoint.
grant execute on function public.host_games() to authenticated;
grant execute on function public.delete_game(uuid) to authenticated;
grant execute on function public.join_request_state(uuid, text) to anon, authenticated;
