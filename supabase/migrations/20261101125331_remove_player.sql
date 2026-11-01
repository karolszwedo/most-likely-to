-- S-09 remove-player-new-link: a leader removes a guest from the room, and the room gets a new link code in the same
-- move (context/changes/remove-player-new-link/plan.md, Faza 1; PRD FR-004; the owner's decisions 1-8 in
-- context/changes/remove-player-new-link/research.md, "Decyzje do planu").
--
-- Who may remove whom (decision 2): the host removes any guest of the room, a co-host included; a co-host removes the
-- guests with no role, and removing another co-host or itself gets the new refusal cohost_protected, because only the
-- host decides about co-hosts, as in set_cohost. Nobody removes the host: its own row (user_id set) is no guest's, so
-- its nick is player_unknown, as in set_cohost.
--
-- The votes of a round in progress (decision 1, Open Roadmap Question 3):
--   - the votes for the removed player are lost: private.finish_round counts only the eligible players still in
--     players, so the reveal shows the others' counts as they were cast;
--   - a vote the removed player cast stays counted, because nothing knows whom it was for (anonymity): the player stays
--     in the round's eligible next to their row in private.round_voters, or the round would reveal one vote early;
--   - a round still waiting for a removed player who has not voted stops waiting: the player leaves the round's
--     eligible, and the threshold of cast_vote is checked at once, so the removal itself reveals the round when every
--     player left has voted. eligible never empties: the host is in every round's snapshot and is never removed.
-- remove_player looks only at whether the player's id is in private.round_voters (who has voted, which the room sees
-- anyway), never at private.ballot_boxes: it reads no tally and changes no key of it.
--
-- Nothing of the removed player stays (decision 4): their thumb in private.round_reactions is deleted with them, and
-- deleting their row in players takes, by the foreign keys, their token's hash (player_secrets: their cookie opens
-- nothing any more) and their results (round_results: they leave the past reveals and the game's summary). The colours
-- of the others stay (players.color). They come back only with the new link (decision 6): in the lobby through
-- join_room, while the game is in play through request_join and a leader's "Wpuść", the same cookie included, since its
-- hash is gone.
--
-- The link: rooms.link_token gets a new code, made as create_room makes one, so the old one is unknown to room_link,
-- join_room and request_join from then on. The room, its id, its channel and every other player's token stay, so
-- nobody else leaves (the link is apart from the room since *_room_lobby.sql for this). 128 random bits: a collision is
-- not handled, and the unique constraint would roll the whole move back.
--
-- room_lobby (same signature, create or replace, from its latest definition in *_player_color_choice.sql with only the
-- new key and its comment changed): link_token, the room's link code, for a leader in every status, for the Worker,
-- which makes the players' link of it; null for anyone else. So a code one leader changes reaches every leader's
-- screen with the next fetch (decision 5: the host and the co-hosts see the players' link, in the lobby and while the
-- game is in play).
--
-- The invariants of every round function in *_first_live_round.sql hold here too: the room's row is locked first,
-- everything is checked before the first write, an expected refusal is data ({ok: false, reason}), never an exception,
-- no function returns a vote's target, and counts appear only once a round is revealed. remove_player answers exactly
-- { ok: true }: nothing about the votes, nor the new code.
--
-- Deployment order (plan, Critical Implementation Details): this migration ships before the Worker that uses it. For
-- the Worker deployed before it, it only adds: remove_player is a function nobody calls yet, and that Worker copies
-- only the keys of its own contract from room_lobby, so link_token passes it by. The new Worker requires link_token,
-- which only this migration gives.
--
-- Never edit this file once it has been pushed; a fix is a new migration.

-- Leader: remove a player ---------------------------------------------------------------------------------------------

-- Definer, the leader's: "Usuń" by a guest's nick on the list of players, in the lobby and while the game is in play.
-- p_nick is a nick of the room (as compared, as in set_cohost). { ok: true } and nothing else, or { ok: false, reason }
-- with reason in room_unknown (no room, or not a player of this room: no token, another room's token, a player removed
-- already, a latecomer still waiting), not_leader (a player of the room with no role), room_closed, player_unknown (no
-- guest with that nick: a nick in no room, the host's own, or one removed already), cohost_protected (a co-host
-- removing a co-host, itself included). A malformed token raises 22023, in private.leader_refusal. Every refusal comes
-- before the first write.
create function public.remove_player(p_room_id uuid, p_nick text, p_player_token text default null)
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
  v_player uuid;
  v_player_cohost boolean;
  v_round uuid;
  v_phase text;
  v_eligible uuid[];
  v_left integer;
  v_voters integer;
begin
  -- The room's row first: a vote, a way in or another leader's move right now waits for this one, so the last vote and
  -- the removal never race for the round's threshold, and nobody comes in with the old code once it is replaced.
  select r.host_id, r.status into v_host, v_status
  from public.rooms r
  where r.id = p_room_id
  for update;

  -- Only the room's leader removes a player; anyone else learns nothing about the room.
  v_refusal := private.leader_refusal(p_room_id, v_host, p_player_token);
  if v_refusal is not null then
    return jsonb_build_object('ok', false, 'reason', v_refusal);
  end if;

  if v_status = 'closed' then
    return jsonb_build_object('ok', false, 'reason', 'room_closed');
  end if;

  -- A guest of the room: the host's own row (user_id set) is never one. A nick over the nick rule's cap is no player's,
  -- and its regular expressions never run on it.
  if char_length(p_nick) <= 100 then
    select p.id, p.cohost into v_player, v_player_cohost
    from public.players p
    where p.room_id = p_room_id and p.user_id is null and p.nick_key = private.nick_key(p_nick);
  end if;

  if v_player is null then
    return jsonb_build_object('ok', false, 'reason', 'player_unknown');
  end if;

  -- Decision 2: only the host decides about co-hosts. A leader who is not the host is a co-host, known by its token.
  if v_player_cohost and v_user is distinct from v_host then
    return jsonb_build_object('ok', false, 'reason', 'cohost_protected');
  end if;

  -- (a) Decision 1: the latest round, while it is voting, stops waiting for a player who has not voted. Whether the
  -- player has voted is read from private.round_voters only; a player who has voted stays in eligible.
  if v_status = 'playing' then
    select r.id, r.phase, r.eligible into v_round, v_phase, v_eligible
    from private.rounds r
    where r.room_id = p_room_id
    order by r.number desc
    limit 1;
  end if;

  if v_phase = 'voting'
    and v_player = any (v_eligible)
    and not exists (select 1 from private.round_voters v where v.round_id = v_round and v.player_id = v_player) then
    update private.rounds r
    set eligible = array_remove(r.eligible, v_player)
    where r.id = v_round
    returning cardinality(r.eligible) into v_left;

    -- The threshold of cast_vote: once every eligible player left has voted, the removal reveals the round.
    select count(*) into v_voters
    from private.round_voters v
    where v.round_id = v_round;

    if v_voters >= v_left then
      perform private.finish_round(v_round);
    end if;
  end if;

  -- (b) The player's thumb on a reveal, which no fold will count now.
  delete from private.round_reactions t
  using private.rounds r
  where r.id = t.round_id and r.room_id = p_room_id and t.player_id = v_player;

  -- (c) The player, and by the foreign keys their token's hash (player_secrets) and their results (round_results).
  delete from public.players where id = v_player;

  -- (d) A new link code, as create_room makes one: 16 random bytes, base64url without padding, 22 characters.
  update public.rooms
  set link_token = translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/=', '-_')
  where id = p_room_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- State for the screens -----------------------------------------------------------------------------------------------

-- Definer: the room's state for its host (auth.uid()) or for a player whose token hash is in this room; null for anyone
-- else, whether or not the room exists, a latecomer still waiting included. Returns nicks in seat order and no ids,
-- user ids or hashes, and the link code only to a leader (link_token, below), plus the latest round of a game in play:
-- who may vote in it (eligible: the players when it opened, in seat order, so someone let in since then is among the
-- players but not here until the next question), who has voted while it is open (never how, never a count) and whether
-- the round before it was skipped (after_skip); the counts per nick once it is revealed; only its number and phase once
-- it is skipped. A voting or revealed round says its question by question_id, or, for an entry of the list with a text
-- of its own, by question_text (null otherwise). No round in the lobby, and none once the room is closed: a round that
-- ended without a reveal has no counts to show. players: { nick, host, cohost, color } each, so everyone sees who leads
-- and each player's colour (S-18: players.color, 0-19, the same all game unless its player changes it; only here, never
-- in a round's data). A leader is the host or a co-host (S-07). requests: the nicks of the latecomers waiting, in the
-- order of asking, for a leader; [] for anyone else, and in every status (none before the start, and none once the room
-- is closed). question_list: for the host of a room with a list, in every status, its entries not removed in the order
-- of positions and the number of its rows with a question id of the base (base_count, removed and reworded entries
-- included); null for a guest, a co-host included, and for a room with no list. leader_draw: for a leader, in every
-- status, what the leader's moves need, for the Worker only: the room's categories and its 18+ ones, the number of the
-- list's entries not removed (list_entries) and its base_count (list_base_count), both 0 with no list; never the list
-- itself; null for anyone else. link_token: for a leader, in every status, the room's link code, for the Worker, which
-- makes the players' link of it (S-09: removing a player replaces the code, and every leader's screen gets the new one
-- with the next fetch); null for anyone else. game_totals: for a closed room with a revealed round, the number of its
-- revealed rounds (revealed) and the sums of their results (totals: every player with a result in at least one of
-- them, as nick and votes, in seat order, zeros included); only counts per nick from the reveals, never a voter; null
-- in the lobby, while the game is in play and for a closed room with no revealed round.
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
    -- S-09: the players' link is the leaders' to share, so only a leader gets its code; nobody else learns it here.
    'link_token', case when v_leader then v_link_token end,
    'game_totals', v_game_totals
  );
end;
$$;

-- Function owners and grants ------------------------------------------------------------------------------------------

-- A security definer function runs with its owner's rights; on Supabase that must be postgres.
alter function public.remove_player(uuid, text, text) owner to postgres;
alter function public.room_lobby(uuid, text) owner to postgres;

-- As in *_player_color_choice.sql: create or replace keeps a function's grants, and the revokes are repeated for every
-- function this file creates or replaces, so each one's grants read in one place.
revoke execute on function public.remove_player(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.room_lobby(uuid, text) from public, anon, authenticated;

-- A co-host is a guest with no session, so removing a player is a public endpoint, like the leader's other moves, with
-- every check inside. The room's state stays readable by its guests.
grant execute on function public.remove_player(uuid, text, text) to anon, authenticated;
grant execute on function public.room_lobby(uuid, text) to anon, authenticated;
