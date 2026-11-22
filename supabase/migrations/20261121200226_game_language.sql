-- english-version (S-27): the game's language (język gry), a feature of the room
-- (context/changes/english-version/plan.md, Faza 2; PRD FR-031 and its addendum of 2026-11-21; Karol's decisions 1-2 at
-- the top of that plan). Decision 1: the host picks Polish or English at "Nowa gra"; the game's language is the start
-- language of every player's screens (the link's page with its card on Discord, the room, the end of the game, the
-- game's history) and the game's pool of questions: an English game draws only the questions with an English text. It
-- never changes once the room is made. Decision 2: the English questions are translations of the same question ids, so
-- private.question_base, its snapshots and private.question_stats stay as they are, and one id counts both languages.
--
-- public.rooms.language: 'pl' or 'en' (a check), not null, 'pl' by default, so every room made before this migration
-- is a Polish game, as it was. Only create_room writes it. authenticated reads it with the rest of its own room (the
-- select of *_first_live_round.sql and the policy "Hosts read their rooms"), which "Przejrzyj pytania" and "Dolosuj
-- pytanie" need for their draw (src/lib/rooms/server.ts, hostRoomCategories); it has no update, and anon reads nothing
-- of rooms. No new grant and no new policy.
--
-- create_room gets p_language text default 'pl' as its last argument, from its latest definition in
-- *_security_hardening.sql with only the new argument, its check, its write and their comments added: invalid_language
-- for anything but pl and en, null included, right after the checks of the categories and before anything is written
-- or closed. The old version (text, text, text[], text[], boolean) is dropped, so there is one version, as of every
-- function a role calls: dropped and created in one transaction, so no call finds neither.
--
-- room_lobby, room_link and game_history (same signatures, create or replace, from their latest definitions in
-- *_players_channel_key.sql, *_first_live_round.sql and *_game_history_details.sql with only the read of the column,
-- the new key and their comments added) give the game's language:
--   - room_lobby: language to everyone it gives the room's state (the host and every guest, a co-host included), in
--     every status, next to channel_key; nobody else, since whoever gets null gets no state at all;
--   - room_link: language with open, started and closed, so the /j/<code> page and the link's card on Discord know the
--     game's language before a player comes in; closed still without room_id, unknown unchanged;
--   - game_history: language in the history of an ended game, the host's only, as before.
--
-- Nothing here touches a round's urn or a vote: the language is the room's, the same for every player of it, and names
-- no vote and no player. No function returns anything more than before but this one key.
--
-- Deployment order (plan, Critical Implementation Details, "Kolejność wdrożenia"): this migration ships before the
-- Worker's change. For the Worker deployed before it, it only adds: that Worker calls create_room with its five
-- arguments by name, which the new version takes with p_language at its default (a Polish game, as every game so far),
-- and it copies only the keys of its own contract from room_lobby, room_link and game_history (parseLobbyState,
-- roomLink and parseGameHistory in src/lib/rooms/), so language passes it by. The new Worker requires language and
-- reads rooms.language, which only this migration gives, so merging it before the push would stop every room from
-- opening.
--
-- Never edit this file once it has been pushed; a fix is a new migration.

-- The game's language -------------------------------------------------------------------------------------------------

-- The game's language, as the host picked it at "Nowa gra": Polish (pl) or English (en). A constant default, so adding
-- the column gives every existing room pl. create_room writes it once, and nothing changes it after (decision 1).
alter table public.rooms
  add column language text not null default 'pl'
    check (language in ('pl', 'en'));

-- Host: new room ------------------------------------------------------------------------------------------------------

-- One version only: the old one beside this one would make a room with no check of the language. The new one takes
-- the old one's calls, by name and by position, with p_language at its default.
drop function public.create_room(text, text, text[], text[], boolean);

-- Definer (F1): the host has no write grant of its own. Closes the host's open room, a game in play included (asks
-- first when guests are in it), drops its round's in-progress state, then opens a new one with the host as player 1, in
-- one transaction. p_link_token is ignored: the code is made here. S-18: the host takes the new room's first free
-- colour, 0. S-17: every picked category is one of the shared question base, else invalid_categories, before anything
-- is closed. security-hardening: invalid_categories also for a list longer than the base's categories, or a list of
-- 18+ ones longer than the picked ones, or a name twice in either (DB-5); too_many_games once the host has 60 rooms
-- created in the last hour (DB-1); both before anything is closed. english-version: the game's language, pl or en, else
-- invalid_language, also before anything is closed; the room keeps it for its life.
create function public.create_room(
  p_nick text,
  p_link_token text,
  p_categories text[],
  p_adult_categories text[],
  p_confirm_close boolean default false,
  p_language text default 'pl'
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

  -- security-hardening (DB-5): the lengths first, before a long list is read: no more names than the shared question
  -- base has categories, and no more 18+ names than picked ones (the Worker sends at most the base's categories, each
  -- once, src/pages/api/rooms/index.ts). A null list is left to the check of S-17 below.
  if cardinality(p_categories) > (select count(distinct b.category) from private.question_base b)
    or cardinality(p_adult_categories) > cardinality(p_categories) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_categories');
  end if;

  -- Then each name once in each list. A null in a list is not counted as a name, so it is refused here too.
  if (select count(distinct c.category) from unnest(p_categories) as c (category)) <> cardinality(p_categories)
    or (select count(distinct a.category) from unnest(p_adult_categories) as a (category))
      <> cardinality(p_adult_categories) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_categories');
  end if;

  -- S-17: and every name the category of a row of the shared question base, as the Worker checks it
  -- (src/pages/api/rooms/index.ts): a name the base does not have would pick no question.
  if coalesce(cardinality(p_categories), 0) < 1
    or array_position(p_categories, null) is not null
    or not (coalesce(p_adult_categories, '{}') <@ p_categories)
    or not (p_categories <@ array(select b.category from private.question_base b)) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_categories');
  end if;

  -- english-version: the game's language, Polish or English (FR-031, decision 1), as the Worker checks it
  -- (src/pages/api/rooms/index.ts); anything else, null included, is no language a game is played in.
  if p_language is null or p_language not in ('pl', 'en') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_language');
  end if;

  -- security-hardening (DB-1): at most 60 new games per account per hour (Karol's decision of 2026-11-16, above the 37
  -- games the e2e suite opens on one account per run). Every room of the host created in the last hour counts, the open
  -- one and the closed ones alike; a game deleted with delete_game drops out. Before the host's open room is closed, so
  -- the refusal changes nothing.
  if (
    select count(*) from public.rooms r where r.host_id = v_host and r.created_at > now() - interval '1 hour'
  ) >= 60 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_games');
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

    -- 16 random bytes, base64url without padding: 22 characters, as in src/lib/rooms/tokens.ts. english-version: the
    -- game's language as the host picked it, fixed for the room's life: nothing else writes it.
    insert into public.rooms (host_id, link_token, categories, adult_categories, language)
    values (
      v_host,
      translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/=', '-_'),
      p_categories,
      coalesce(p_adult_categories, '{}'),
      'pl'
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

-- The link's page -----------------------------------------------------------------------------------------------------

-- Definer: what the /j/<code> page needs, nothing more. A malformed code is just unknown. english-version: the game's
-- language with every room the code opens (open, started and closed), so the page and its card on Discord speak it
-- before anyone comes in; still no room_id for a closed room, and nothing more for an unknown code.
create or replace function public.room_link(p_link_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_room uuid;
  v_status text;
  v_language text;
begin
  if p_link_token is null or p_link_token !~ '^[A-Za-z0-9_-]{22}$' then
    return jsonb_build_object('status', 'unknown');
  end if;

  select r.id, r.status, r.language into v_room, v_status, v_language
  from public.rooms r
  where r.link_token = p_link_token;

  if v_room is null then
    return jsonb_build_object('status', 'unknown');
  end if;

  if v_status = 'lobby' then
    return jsonb_build_object('status', 'open', 'room_id', v_room, 'language', v_language);
  end if;

  -- A game in play: the page lets the room's own players back in and turns everyone else away.
  if v_status = 'playing' then
    return jsonb_build_object('status', 'started', 'room_id', v_room, 'language', v_language);
  end if;

  return jsonb_build_object('status', 'closed', 'language', v_language);
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
-- language (english-version): for every player, a co-host and a guest with no role included, in every status, the
-- game's language as create_room wrote it, pl or en, the same for each and fixed for the room's life; the Worker draws
-- the game's questions by it (an English game only those with an English text) and opens the room's screens in it.
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
  v_language text;
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
  select r.host_id, r.status, r.categories, r.adult_categories, r.link_token, r.channel_key, r.language
  into v_host, v_status, v_categories, v_adult_categories, v_link_token, v_channel_key, v_language
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
    'channel_key', v_channel_key,
    -- english-version: the game's language, every player's and the same for each, as channel_key: the room's, tied to
    -- no vote and to no one.
    'language', v_language,
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

-- Host: the history of an ended game ----------------------------------------------------------------------------------

-- Definer, the signed-in host's: one of its ended games for the page /gry/<id> (*_game_history_details.sql). A definer
-- function because the rounds, their results and the game's question list live in schema private, which no API role
-- reaches; past the refusals every row it reads belongs to the caller's room. Writes nothing. english-version: the
-- game's language too, the start language of the history's page.
create or replace function public.game_history(p_room_id uuid)
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
  v_language text;
begin
  select r.host_id, r.status, r.created_at, r.started_at, r.language
  into v_host, v_status, v_created_at, v_started_at, v_language
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
    -- english-version: the game's language, the start language of the history's page.
    'language', v_language,
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

-- Function owners and grants ------------------------------------------------------------------------------------------

-- A security definer function runs with its owner's rights; on Supabase that must be postgres.
alter function public.create_room(text, text, text[], text[], boolean, text) owner to postgres;
alter function public.room_link(text) owner to postgres;
alter function public.room_lobby(uuid, text) owner to postgres;
alter function public.game_history(uuid) owner to postgres;

-- As in *_security_hardening.sql: a new function gets execute for PUBLIC by default, and create or replace keeps a
-- function's grants, so the revokes are repeated for every function this file creates or replaces, and each one's
-- grants read in one place.
revoke execute on function public.create_room(text, text, text[], text[], boolean, text)
  from public, anon, authenticated;
revoke execute on function public.room_link(text) from public, anon, authenticated;
revoke execute on function public.room_lobby(uuid, text) from public, anon, authenticated;
revoke execute on function public.game_history(uuid) from public, anon, authenticated;

-- The same grants as before: creating a room is the signed-in host's, and so is the history of an ended game, with the
-- host checked inside; the link's page and the room's state are public endpoints (a guest has no session), with every
-- check inside.
grant execute on function public.create_room(text, text, text[], text[], boolean, text) to authenticated;
grant execute on function public.room_link(text) to anon, authenticated;
grant execute on function public.room_lobby(uuid, text) to anon, authenticated;
grant execute on function public.game_history(uuid) to authenticated;
