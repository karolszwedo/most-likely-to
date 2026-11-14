-- players-only-live-channel: the room's emotes go on a live topic that only the room's players know
-- (context/changes/players-only-live-channel/plan.md, Faza 1; the owner's decisions 1-4 at the top of that plan;
-- W-A′ in context/changes/players-only-live-channel/research.md, "Kontynuacja").
--
-- The channel key (klucz kanału): public.rooms.channel_key, a random code of the room made as the link code is, 128
-- bits. The Worker sends the room's emotes on the topic live-players:<channel_key> and the room's screens listen there,
-- while the bells stay on the public topic of the room's id. Every room gets its own key from the column's default: a
-- new one through create_room, which stays as it is, and every room made before this migration as the column is added.
--
-- Who gets it: room_lobby (same signature, create or replace, from its latest definition in *_game_length.sql with
-- only the read of the column, the new key and their comments changed) gives channel_key to everyone it gives the
-- room's state: the host and every guest, a co-host included, in the lobby, while the game is in play and once the
-- room is closed. Nobody else learns it: room_lobby gives null to a latecomer waiting or turned away, to a removed
-- player and to a token whose place moved, and join_request_state, unchanged, never names it. No new grant and no new
-- policy on public.rooms.
--
-- When it changes: remove_player (same signature, create or replace, from its one definition in *_remove_player.sql
-- with only step (d) and its comment changed) gives the room a new channel key in the same update as the new link
-- code, so a removed player hears the room's emotes no more and the players left move to the new topic with their
-- next fetch of the room's state. Nothing else changes it (decision 3): admit_latecomer, unchanged, moves a place to
-- another device on a request to come back (S-04) and leaves the key as it is, since the place's player is the same
-- person; end_game, set_cohost and reject_latecomer leave it too.
--
-- The key names no vote and no player: it is the room's, the same for every player of it.
--
-- The invariants of every round function in *_first_live_round.sql hold here too: the room's row is locked first,
-- everything is checked before the first write, an expected refusal is data ({ok: false, reason}), never an exception,
-- no function returns a vote's target, and counts appear only once a round is revealed. remove_player still answers
-- exactly { ok: true }: nothing about the votes, nor either new code.
--
-- Deployment order (plan, Critical Implementation Details): this migration ships before the Worker that uses it. For
-- the Worker deployed before it, it only adds: that Worker copies only the keys of its own contract from room_lobby, so
-- channel_key passes it by, and remove_player answers as before. The new Worker requires channel_key, which only this
-- migration gives, so merging it before the push would stop every room from opening.
--
-- Never edit this file once it has been pushed; a fix is a new migration.

-- The channel key -----------------------------------------------------------------------------------------------------

-- The room's code for the topic of its players' channel, live-players:<channel_key>, on which the Worker sends the
-- room's emotes. Made as the link code is: 16 random bytes, base64url without padding, 22 characters. The default is
-- volatile, so adding the column computes it for every existing row and each room made before this migration gets a
-- key of its own. No unique constraint: nothing looks a room up by its key, and 128 random bits do not collide. Every
-- player of the room gets it from room_lobby, in every status; nobody else does. remove_player replaces it, together
-- with the link code; nothing else changes it. It never goes into the game's addresses or logs; it is in the Supabase
-- API logs, in the path of the Worker's call to Realtime, which only the game's creator sees, who reads the database
-- anyway. authenticated reads it with the rest of its own room (the select of *_first_live_round.sql and the policy
-- "Hosts read their rooms"), and the host is a player of the room; it has no update, and anon reads nothing of rooms.
alter table public.rooms
  add column channel_key text not null
    default translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/=', '-_')
    check (channel_key ~ '^[A-Za-z0-9_-]{22}$');

-- Leader: remove a player ---------------------------------------------------------------------------------------------

-- Definer, the leader's: "Usuń" by a guest's nick on the list of players, in the lobby and while the game is in play.
-- p_nick is a nick of the room (as compared, as in set_cohost). { ok: true } and nothing else, or { ok: false, reason }
-- with reason in room_unknown (no room, or not a player of this room: no token, another room's token, a player removed
-- already, a latecomer still waiting), not_leader (a player of the room with no role), room_closed, player_unknown (no
-- guest with that nick: a nick in no room, the host's own, or one removed already), cohost_protected (a co-host
-- removing a co-host, itself included). A malformed token raises 22023, in private.leader_refusal. Every refusal comes
-- before the first write.
create or replace function public.remove_player(p_room_id uuid, p_nick text, p_player_token text default null)
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

  -- (d) A new link code, as create_room makes one: 16 random bytes, base64url without padding, 22 characters. In the
  -- same update a new channel key, made the same way (players-only-live-channel): the removed player's screen knew the
  -- old one, so the topic of the players' channel moves with it.
  update public.rooms
  set link_token = translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/=', '-_')
  where id = p_room_id;

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
-- channel_key (players-only-live-channel): for every player, a co-host and a guest with no role included, in every
-- status, the room's channel key, with which the player's screen listens to the room's emotes and the Worker sends
-- them (live-players:<channel_key>); removing a player replaces it, and every screen left gets the new one with the
-- next fetch. Never anyone else's: whoever gets null here gets no key either.
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
  v_channel_key text;
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
  select r.host_id, r.status, r.categories, r.adult_categories, r.link_token, r.channel_key
  into v_host, v_status, v_categories, v_adult_categories, v_link_token, v_channel_key
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
    -- players-only-live-channel: the topic of the room's emotes is every player's, so every player gets its key; this
    -- point is past every null above, so nobody outside the room learns it here.
    'channel_key', case when v_leader then v_channel_key end,
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

-- A security definer function runs with its owner's rights; on Supabase that must be postgres.
alter function public.remove_player(uuid, text, text) owner to postgres;
alter function public.room_lobby(uuid, text) owner to postgres;

-- As in *_game_length.sql: create or replace keeps a function's grants, and the revokes are repeated for every function
-- this file replaces, so each one's grants read in one place.
revoke execute on function public.remove_player(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.room_lobby(uuid, text) from public, anon, authenticated;

-- A co-host is a guest with no session, so removing a player is a public endpoint, like the leader's other moves, with
-- every check inside. The room's state stays readable by its guests.
grant execute on function public.remove_player(uuid, text, text) to anon, authenticated;
grant execute on function public.room_lobby(uuid, text) to anon, authenticated;
