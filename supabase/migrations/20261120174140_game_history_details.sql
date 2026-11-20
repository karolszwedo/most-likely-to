-- S-26 game-history-details: the signed-in host opens one of its ended games and sees its history, the evening's
-- summary and then the game's questions in the order they were played, each with its reveal's result as the room saw it
-- (context/changes/game-history-details/plan.md, Faza 1; PRD FR-030; Karol's decisions 1-3 of 2026-11-20 at the top of
-- that plan: a page of its own per game, /gry/<id>; a short note under a reveal whose votes went with a removed player,
-- with no number and no nick; a badge for the host's own or reworded question and for an approved proposal, never its
-- author).
--
-- game_history, the host's: one closed room of the caller, as { ok: true, created_at, started_at, me, players,
-- rounds }. me is the nick of the host's own player. players are every player of the room as { nick, color } in seat
-- order; a player removed during the game (S-09) is not there. rounds are every round of the room in the order of
-- numbers, each as { number, phase, question_id, question_text, origin }, and a revealed one with { results,
-- abstained, ballots } added. phase says how the round ended: revealed, skipped, or voting for a round cut short
-- without a reveal ("Zakończ grę", "Nowa gra" or the sweep; which one, the database does not know). results are the
-- round's rows of private.round_results as { nick, votes } in seat order, zeros included: the counts its reveal showed
-- the room (room_lobby's revealed round), less a removed player's, whose rows went with them. question_id is the
-- round's own (a question of the base, whose text stays in the Worker: context/foundation/lessons.md, "Pytania gry
-- tylko po stronie serwera"); question_text is the text of the round's entry of the game's question list when that
-- entry has one, else null. origin: proposal for an entry approved from a proposal; own for an entry with a text of
-- its own, the host's own question and a question of the base the host reworded alike (decision 3); base otherwise, a
-- round from no entry of the list or from an entry with no text.
--
-- What it never gives: who voted for whom (no row holds it: round_results has no voter), who had voted ("kto już
-- zagłosował", the urn's private.round_voters, gone at every reveal and every end), who could vote (eligible), the
-- author of a proposal (gone with the leader's decision, at the latest with the room's closing), anything of another
-- host's game or of a game still open. ballots, the number of players who cast a ballot at a reveal (a vote or an
-- abstention), is a count room_lobby already gives every player of the room at that reveal; here it is only for the
-- Worker, which tells from it a reveal whose votes went with a removed player (its results and abstained sum to less
-- than ballots) and gives the page that note alone, never the number (decision 2). As the PRD accepts (NFR on
-- anonymity), a reveal where everyone named the same player shows that in the history too, until the host deletes the
-- game (FR-019).
--
-- Refusals come before anything of the game is read, as in delete_game (*_host_game_history.sql): no room, no caller or
-- another host's room is room_unknown, a room not closed (the lobby or a game in play) game_not_ended. Writes nothing.
--
-- Deployment order (plan, Critical Implementation Details): this migration ships before the Worker that calls it. It
-- only adds a function the Worker deployed before it never calls, so pushed early it changes nothing.
--
-- Never edit this file once it has been pushed; a fix is a new migration.

-- Host: the history of an ended game ----------------------------------------------------------------------------------

-- Definer, the signed-in host's: one of its ended games for the page /gry/<id> (the head of this file). A definer
-- function because the rounds, their results and the game's question list live in schema private, which no API role
-- reaches; past the refusals every row it reads belongs to the caller's room. Writes nothing.
create function public.game_history(p_room_id uuid)
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
  v_created_at timestamptz;
  v_started_at timestamptz;
begin
  select r.host_id, r.status, r.created_at, r.started_at
  into v_host, v_status, v_created_at, v_started_at
  from public.rooms r
  where r.id = p_room_id;

  -- Only the host reads its games. Another host's room looks like no room at all, as in delete_game.
  if v_host is null or v_user is null or v_user <> v_host then
    return jsonb_build_object('ok', false, 'reason', 'room_unknown');
  end if;

  -- Only an ended game has a history: the lobby and a game in play are the room screen's.
  if v_status <> 'closed' then
    return jsonb_build_object('ok', false, 'reason', 'game_not_ended');
  end if;

  return jsonb_build_object(
    'ok', true,
    'created_at', v_created_at,
    'started_at', v_started_at,
    -- The host's own player: create_room inserts it with the host's user_id, and nobody removes it.
    'me', (select p.nick from public.players p where p.room_id = p_room_id and p.user_id = v_host),
    'players', (
      select coalesce(
        jsonb_agg(jsonb_build_object('nick', p.nick, 'color', p.color) order by p.seat),
        '[]'::jsonb
      )
      from public.players p
      where p.room_id = p_room_id
    ),
    'rounds', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'number', r.number,
            'phase', r.phase,
            'question_id', r.question_id,
            'question_text', g.text,
            'origin', case
              when coalesce(g.proposed, false) then 'proposal'
              when g.text is not null then 'own'
              else 'base'
            end
          )
          -- Only a reveal has counts; a skipped round and one cut short keep none (finish_round sets them).
          || case
            when r.phase = 'revealed' then jsonb_build_object(
              -- Counts per nick and nothing more, as room_lobby gives them at the reveal.
              'results', (
                select coalesce(
                  jsonb_agg(jsonb_build_object('nick', p.nick, 'votes', rr.votes) order by p.seat),
                  '[]'::jsonb
                )
                from private.round_results rr
                join public.players p on p.id = rr.player_id
                where rr.round_id = r.id
              ),
              'abstained', r.abstained,
              'ballots', r.ballots
            )
            else '{}'::jsonb
          end
          order by r.number
        ),
        '[]'::jsonb
      )
      from private.rounds r
      -- The round's entry of the game's question list, if any: its text and whether it came from a proposal.
      left join private.game_questions g on g.room_id = r.room_id and g.position = r.list_position
      where r.room_id = p_room_id
    )
  );
end;
$$;

-- Function owner and grants -------------------------------------------------------------------------------------------

-- A security definer function runs with its owner's rights; on Supabase that must be postgres.
alter function public.game_history(uuid) owner to postgres;

revoke execute on function public.game_history(uuid) from public, anon, authenticated;

-- The history is the signed-in host's, with the host checked inside (PRD Access Control and FR-030: a co-host and a
-- guest have no host's panel, and no session).
grant execute on function public.game_history(uuid) to authenticated;
