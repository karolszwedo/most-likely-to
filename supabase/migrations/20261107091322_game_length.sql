-- game-length: every game has a number of questions that every player sees, the game stops after its last question,
-- and a leader may go on with "Jeszcze 5 pytań" (context/changes/game-length/plan.md, Faza 1; Karol's decisions at the
-- top of that plan and in context/changes/game-length/change.md).
--
-- The number of the game's questions is worked out, never stored whole, in one place: private.question_count. With a
-- list the host reviewed (a row of private.game_questions that is not an approved proposal), the list's entries not
-- removed, the approved proposals included; with none, 15 and the approved proposals, so each approved proposal adds
-- one question ("z 16"); plus the questions the leaders added with "Jeszcze 5 pytań" (public.rooms.extra_questions). A
-- list whose every entry is removed gives 0, and start_game still answers list_empty. The list changes only in the
-- lobby and an approved proposal is never removed, so the number never falls during a game.
--
-- The stop: private.open_next_round, which next_round and skip_round call, opens no round past that number. So
-- next_round after the last question answers no_questions, and skip_round of the last question answers ok with the
-- skipped round left the latest one, as when the pool runs out. A skipped question uses up one of the game's questions
-- (decision 4): a round's number counts the skips too, so 3 skips in a game of 15 leave 12 reveals.
--
-- more_questions, "Jeszcze 5 pytań", the leader's: on the latest round, revealed or skipped, once it is the game's last
-- question, it adds as many questions as can still be drawn, at most 5: candidates not played in this room and on no
-- row of its list (private.unplayed_candidates), each id counted once, so the number never promises a question that is
-- not there. It then opens the next round at once, as next_round does, so the leader's screen moves on. No such
-- candidate is no_questions, with nothing written. On a stale screen, a round before the last one (another leader has
-- just approved a proposal), it adds nothing and does what next_round does.
--
-- room_lobby (same signature, create or replace, from its latest definition in *_guest_question_proposals.sql with only
-- the new key and its comment changed) adds question_count for every player, in every status: a number, never the list,
-- which stays the host's. leader_draw stays as it is: the Worker counts from it how many questions "Jeszcze 5 pytań"
-- can add, so its button never says more than the database adds.
--
-- The number is a count of the game's questions, the same for every player: it names no vote and no player.
--
-- The invariants of every round function in *_first_live_round.sql hold here too: the room's row is locked first,
-- everything is checked before the first write, an expected refusal is data ({ok: false, reason}), never an exception,
-- no function returns a vote's target, and counts appear only once a round is revealed.
--
-- Deployment order (plan, Critical Implementation Details): this migration ships before the Worker that uses it, and
-- outside a game: a game in play past its 15th question when it ships stops at once, and its leader ends it. For the
-- Worker deployed before it, more_questions is a function nobody calls yet, and question_count a key that Worker does
-- not copy from room_lobby; next_round after the last question answers no_questions, which that Worker shows as "Pytań
-- już nie ma. Możesz zakończyć grę.". The new Worker requires question_count, which only this migration gives, so
-- merging it before the push would stop every room from opening.
--
-- Never edit this file once it has been pushed; a fix is a new migration.

-- The questions added with "Jeszcze 5 pytań" --------------------------------------------------------------------------

-- How many questions the room's leaders added to its game with "Jeszcze 5 pytań"; 0 for a new room. A room never goes
-- back to the lobby, so the number never carries over to another game. authenticated reads it with the rest of its own
-- room (the select of *_first_live_round.sql) and has no update: only more_questions writes it. The check bounds what a
-- client calling the database directly could make of it.
alter table public.rooms
  add column extra_questions integer not null default 0 check (extra_questions between 0 and 1000);

-- The number and the candidates: no grants, called only from the definer functions below ----------------------------

-- The number of the game's questions, the one place with it: with a list the host reviewed (any row that is not an
-- approved proposal), its entries not removed, the approved proposals included; with none, 15 and the approved
-- proposals; plus the questions added with "Jeszcze 5 pytań". 0 for a list whose every entry is removed. Stable,
-- because room_lobby calls it too. The caller of a write holds the room's lock.
create function private.question_count(p_room_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select case
           when count(*) filter (where not g.proposed) > 0 then count(*) filter (where not g.removed)
           else 15 + count(*) filter (where g.proposed)
         end::integer
         + (select r.extra_questions from public.rooms r where r.id = p_room_id)
  from private.game_questions g
  where g.room_id = p_room_id
$$;

-- The candidates that may open a round once the list is played, with their place in the given order: in the question
-- id format, not played in this room yet and on no row of its list (removed and reworded entries included). The one
-- definition for private.open_next_round, which takes the first of them, and more_questions, which counts them. Stable:
-- it only reads.
create function private.unplayed_candidates(p_room_id uuid, p_candidates text[])
returns table (question_id text, place bigint)
language sql
stable
set search_path = ''
as $$
  select c.question_id, c.place
  from unnest(p_candidates) with ordinality as c (question_id, place)
  where c.question_id ~ '^[a-z0-9-]+-[0-9]{3}$'
    and not exists (
      select 1 from private.rounds r where r.room_id = p_room_id and r.question_id = c.question_id
    )
    and not exists (
      select 1 from private.game_questions g where g.room_id = p_room_id and g.question_id = c.question_id
    )
$$;

-- The next question, up to the game's last one ------------------------------------------------------------------------

-- Opens round p_number of the room, with an empty urn: the list's first entry that is not removed and has no round yet,
-- the approved proposals before the rest and, among each, in the order of positions; after the list, the first
-- candidate, in the given order, that has the question id format, was not played in this room yet and is on no row of
-- the list (removed and reworded entries included; private.unplayed_candidates). Checked before the insert, so a repeat
-- is never a 23505 with the row's values in DETAIL. Who may vote: the players in the room now, in seat order. false
-- past the game's last question (p_number over private.question_count: the stop of game-length, the one place for
-- next_round and skip_round) and when nothing is left; nothing is written then. The caller holds the room's lock and
-- has checked the room and its latest round.
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

  -- game-length: after the game's last question a leader goes on only with "Jeszcze 5 pytań" (more_questions), which
  -- adds to the number first, or ends the game.
  if p_number > private.question_count(p_room_id) then
    return false;
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
    from private.unplayed_candidates(p_room_id, p_candidates) c
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

-- Leader: "Jeszcze 5 pytań" -------------------------------------------------------------------------------------------

-- Definer, the leader's (the host, or a co-host by p_player_token), with next_round's arguments: "Jeszcze 5 pytań".
-- p_round is the number of the round on the leader's screen, which must be the latest one, revealed or skipped;
-- p_candidates is the game's pool in the Worker's order. Once that round is the game's last question, the game gets as
-- many more questions as private.unplayed_candidates holds, each id counted once, and at most 5; then the next round
-- opens at once and the thumbs are folded, as in next_round (S-11). A round before the game's last one is a stale
-- screen (another leader has just approved a proposal): nothing is added, and the move is next_round's. { ok: true }
-- and nothing else, or { ok: false, reason } with reason in room_unknown, not_leader (private.leader_refusal),
-- room_closed, no_round (a lobby), round_over (another number), round_in_progress (still voting), no_questions (no
-- candidate to add, and nothing is written; or no round to open, which only a game in play past its 15th question when
-- this migration shipped meets, and the questions added stay: accepted in the plan). More than 1000 candidates and a
-- malformed token raise 22023.
create function public.more_questions(
  p_room_id uuid,
  p_round integer,
  p_candidates text[],
  p_player_token text default null
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
  v_number integer;
  v_phase text;
  v_extra integer;
  v_more integer;
begin
  -- The room's row first: a vote, another leader's move or the same click sent twice right now waits for this one, and
  -- then finds the round over.
  select r.host_id, r.status, r.extra_questions into v_host, v_status, v_extra
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

  if v_status = 'playing' then
    select r.number, r.phase into v_number, v_phase
    from private.rounds r
    where r.room_id = p_room_id
    order by r.number desc
    limit 1;
  end if;

  if v_number is null then
    return jsonb_build_object('ok', false, 'reason', 'no_round');
  end if;

  -- A screen behind the game, or the same click sent twice: the round it moves on from is over already.
  if p_round is null or p_round <> v_number then
    return jsonb_build_object('ok', false, 'reason', 'round_over');
  end if;

  if v_phase = 'voting' then
    return jsonb_build_object('ok', false, 'reason', 'round_in_progress');
  end if;

  -- As in private.open_next_round: the game sends at most 216 ids, so more is malformed input from a client calling the
  -- database directly. Checked before the count below, so its message holds no value of the list.
  if coalesce(cardinality(p_candidates), 0) > 1000 then
    raise exception 'too many candidates' using errcode = '22023';
  end if;

  -- Only at the game's last question. Before it, the screen is stale and the game has a question left to open.
  if v_number >= private.question_count(p_room_id) then
    -- Never more than can still be drawn: a public endpoint, so a repeated id counts once. And never past the column's
    -- check of 1000, which a direct client playing ~1000 rounds of made-up ids would otherwise hit as a 23514 with the
    -- room's row in DETAIL; at 1000 the move is no_questions.
    v_more := 5;

    if v_more = 0 then
      return jsonb_build_object('ok', false, 'reason', 'no_questions');
    end if;

    update public.rooms set extra_questions = extra_questions + v_more where id = p_room_id;
  end if;

  if not private.open_next_round(p_room_id, v_number + 1, p_candidates) then
    return jsonb_build_object('ok', false, 'reason', 'no_questions');
  end if;

  -- S-11: only now that the next round is open, as in next_round.
  perform private.fold_reactions(p_room_id);

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
-- a closed room with no revealed round. proposals (S-10): the proposals waiting, as { number, nick, text } in the order
-- of numbers, for a leader, in every status; [] for anyone else, and none once the room is closed. own_proposals
-- (S-10): for every player, in every status, how many proposals they may still send (left) and how many of theirs wait
-- (waiting); never how a decided one was decided. A question approved in a game with no list makes that game have one:
-- list_entries counts it too, list_base_count does not, since it has no question id, and the host's question_list stops
-- being null with the first approval. The Worker gives a screen the list only in the lobby, so nothing shows it.
-- question_count (game-length): for every player, in every status, the number of the game's questions
-- (private.question_count); a number, never the list, so a guest learns how long the game is and no question of it.
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
  if v_leader then
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
    ),
    -- game-length: the number of the game's questions, every player's: "Pytanie 7 z 15", and the lobby's count.
    'question_count', private.question_count(p_room_id)
  );
end;
$$;

-- Function owners and grants ------------------------------------------------------------------------------------------

-- A security definer function runs with its owner's rights; on Supabase that must be postgres. The helpers too, as
-- private.proposals_left in *_guest_question_proposals.sql: the definer functions call them as postgres.
alter function private.question_count(uuid) owner to postgres;
alter function private.unplayed_candidates(uuid, text[]) owner to postgres;
alter function private.open_next_round(uuid, integer, text[]) owner to postgres;
alter function public.more_questions(uuid, integer, text[], text) owner to postgres;
alter function public.room_lobby(uuid, text) owner to postgres;

-- As in *_guest_question_proposals.sql: create or replace keeps a function's grants, and the revokes are repeated for
-- every function this file creates or replaces, so each one's grants read in one place. The private functions get
-- none: only definer functions call them.
revoke execute on function private.question_count(uuid) from public, anon, authenticated;
revoke execute on function private.unplayed_candidates(uuid, text[]) from public, anon, authenticated;
revoke execute on function private.open_next_round(uuid, integer, text[]) from public, anon, authenticated;
revoke execute on function public.more_questions(uuid, integer, text[], text) from public, anon, authenticated;
revoke execute on function public.room_lobby(uuid, text) from public, anon, authenticated;

-- A co-host is a guest with no session, so "Jeszcze 5 pytań" is a public endpoint like the leader's other moves, with
-- every check inside. The room's state stays readable by its guests.
grant execute on function public.more_questions(uuid, integer, text[], text) to anon, authenticated;
grant execute on function public.room_lobby(uuid, text) to anon, authenticated;
