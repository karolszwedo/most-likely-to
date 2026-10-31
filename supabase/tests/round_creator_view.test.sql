-- The creator's view of a round (#1): what the database owner can read and the publishable key cannot. Catalog, grants,
-- publication and the rows a round leaves behind, read as postgres on the throwaway database of the CI job db. Runs
-- after the Vitest db suite on the same database, so other rooms exist: every count here is scoped to this file's rooms
-- and rounds. Oracle: decision D1 of context/archive/2026-10-13-first-live-round/research.md (the urn that disappears:
-- in-progress state only in unlogged private tables with no grants, outside the publication, deleted at the reveal and
-- whenever a round ends otherwise), plan-review F1 of that change (an hourly pg_cron sweep closes games started more
-- than 12 hours ago) and decisions D3 and D4 of context/archive/2026-10-15-full-game-evening/research.md (a skipped
-- round stays as a row with no urn and no count; ending the game drops the urn).
--
-- The round's objects (private.rounds, round_results, ballot_boxes, round_voters, rooms.started_at, start_game,
-- cast_vote, private.close_stale_games, the cron schema) came with S-02; the evening's (next_round, skip_round,
-- end_game, cast_vote with p_round) with phase 2 of S-03; reveal_round with p_round comes with
-- *_round_number_required.sql (deferred-review-fixes); public.join_requests, request_join, join_request_state,
-- admit_latecomer and reject_latecomer with *_latecomer_admission.sql (S-08,
-- context/archive/2026-10-22-latecomer-admission, plan Faza 1 #3: a request to join a game in play, reached only
-- through those functions, outside the publication, and gone from its room once the room closes);
-- private.game_questions, open_question_list, draw_list_question, remove_list_question, edit_list_question and
-- add_own_question with *_question_list_review.sql (S-06, context/archive/2026-10-24-question-list-review, plan Faza 1
-- #3: the game's question list, reached only through those functions, outside the publication, and kept with its room
-- once the room closes); private.question_stats, private.round_reactions, private.stats_excluded_hosts, react_round,
-- private.fold_reactions and private.counts_for_stats with *_question_play_data.sql (S-11,
-- context/changes/question-reactions-play-data, plan Faza 1 #4: the thumbs on a reveal and the per-question counters,
-- reached only through the round functions and outside the publication); players.cohost, private.leader_refusal,
-- set_cohost and the leader's moves with p_player_token, granted to anon too, with *_co_host_role.sql (S-07,
-- context/changes/co-host-role, plan Faza 1 #3: a co-host is a guest who leads the game with its player token, and only
-- set_cohost gives the role, never to the host's own row); players.color, private.free_color, set_player_color and the
-- ways in (create_room, join_room, admit_latecomer) giving the first free colour with *_player_color_choice.sql (S-18,
-- context/changes/player-color-choice, plan Faza 1 #3: a player's colour is a column only the definer functions write,
-- 0-19 with no default, and set_player_color is a public endpoint). Each assertion about an object that may be
-- missing must be its own `not ok`, never an error that ends the file: nothing here names them statically. They are
-- reached only through to_regclass, to_regprocedure, pgTAP functions that report a missing table (table_privs_are,
-- columns_are), lives_ok, and the helpers below, which run a call or a count dynamically and hand the error back as
-- text for the TAP diagnostics.
--
-- Rounds are played through the functions as the game's roles: each call switches to anon, or to authenticated with
-- the host in request.jwt.claims, and back to the owner. Hosts are rows inserted into auth.users by the owner. The
-- whole file is rolled back.
--
-- S-11's thumbs and counters (oracle: Karol's decisions in context/changes/question-reactions-play-data/plan.md). A
-- thumb is in-progress state like the urn: one row per player in the unlogged private.round_reactions, from the reveal
-- until the fold, usually "Następne pytanie", at most about 13 hours for a game abandoned on a reveal (the hourly
-- sweep); a crash empties it. The fold ("Następne pytanie" once the next round is open, "Zakończ grę", "Nowa gra", the
-- sweep) adds the thumbs to their question's counters in private.question_stats and deletes them. The counters also
-- grow at a reveal, a skip and the start of a game with a list, only for a question of the base (an own or reworded
-- question has no question id) and only in a game whose host is not in private.stats_excluded_hosts. They are global,
-- and the Vitest suite before this file plays the same question ids, so each scenario plays question ids of its own
-- (pgtap-<scenario>-NNN) and checks what its moves added to their counters since a snapshot, never a value.

begin;

select plan(291);

-- Helpers ------------------------------------------------------------------------------------------------------------

-- This file's rooms and guests, and every round of those rooms seen so far. A round is remembered by each move of the
-- host and by each count, and never forgotten: a count cannot pass because the round row itself was deleted while its
-- urn rows stayed behind, and the rounds opened after the start (S-03) are counted too.
create temp table test_rooms (key text primary key, host_id uuid not null, room_id uuid not null);
create temp table test_rounds (
  room_key text not null,
  number integer not null,
  round_id uuid not null,
  primary key (room_key, number)
);
create temp table test_guests (
  room_key text not null,
  nick text not null,
  player_token text not null,
  primary key (room_key, nick)
);

create function pg_temp.room_of(p_key text) returns uuid language sql as $$
  select t.room_id from pg_temp.test_rooms t where t.key = p_key
$$;

create function pg_temp.host_of(p_key text) returns uuid language sql as $$
  select t.host_id from pg_temp.test_rooms t where t.key = p_key
$$;

-- Adds the room's rounds that exist now to test_rounds. Raises when private.rounds cannot be read; the callers turn
-- that into text.
create function pg_temp.remember_rounds(p_key text) returns void language plpgsql as $$
begin
  if to_regclass('private.rounds') is null then
    return;
  end if;
  execute $q$
    insert into pg_temp.test_rounds (room_key, number, round_id)
    select $1, r.number, r.id from private.rounds r where r.room_id = $2
    on conflict (room_key, number) do nothing
  $q$ using p_key, pg_temp.room_of(p_key);
end;
$$;

-- The id of the room's round p_number as remembered, or null.
create function pg_temp.round_id_of(p_key text, p_number integer) returns uuid language sql as $$
  select t.round_id from pg_temp.test_rounds t where t.room_key = p_key and t.number = p_number
$$;

create function pg_temp.room_status(p_key text) returns text language sql as $$
  select r.status from public.rooms r where r.id = pg_temp.room_of(p_key)
$$;

-- One call as a role, the way PostgREST makes it: anon with no user, or authenticated as p_user. Returns the call's
-- jsonb, or {"error": sqlstate, "message": ...} when it raised (a missing function in phase 1), so the assertion shows
-- the error instead of the file ending on it. The role goes back to the owner either way.
create function pg_temp.call_as(p_role text, p_user uuid, p_sql text) returns jsonb language plpgsql as $$
declare
  v_answer jsonb;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('role', p_role, 'sub', p_user)::text, true);
  perform set_config('role', p_role, true);
  begin
    execute p_sql into v_answer;
  exception when others then
    v_answer := jsonb_build_object('error', sqlstate, 'message', sqlerrm);
  end;
  reset role;
  return v_answer;
end;
$$;

-- 'ok' for an accepted call; otherwise the whole answer, so a refusal or an error shows in the diagnostics.
create function pg_temp.outcome(p_answer jsonb) returns text language sql as $$
  select case when p_answer ->> 'ok' = 'true' then 'ok' else coalesce(p_answer::text, 'no answer') end
$$;

-- A new host opens a room through create_room and each guest joins through join_room with a fresh 43-character token,
-- each as its role. The link code is read back from the room: phase 2's create_room ignores the one it is sent. Returns
-- the room id, or null when a step was refused.
create function pg_temp.open_room(p_key text, p_guests text[]) returns uuid language plpgsql as $$
declare
  v_host uuid := gen_random_uuid();
  v_answer jsonb;
  v_room uuid;
  v_link text;
  v_nick text;
  v_token text;
begin
  insert into auth.users (id, email) values (v_host, 'pgtap-' || p_key || '@example.com');
  v_answer := pg_temp.call_as('authenticated', v_host, format(
    'select public.create_room(%L, %L, array[%L], array[]::text[], false)',
    'Host', substr(md5(random()::text), 1, 22), 'na-co-dzien'
  ));
  v_room := (v_answer ->> 'room_id')::uuid;
  if v_room is null then
    return null;
  end if;
  select r.link_token into v_link from public.rooms r where r.id = v_room;
  insert into pg_temp.test_rooms (key, host_id, room_id) values (p_key, v_host, v_room);

  foreach v_nick in array p_guests loop
    v_token := md5(random()::text) || substr(md5(random()::text), 1, 11);
    v_answer := pg_temp.call_as('anon', null, format('select public.join_room(%L, %L, %L)', v_link, v_nick, v_token));
    if v_answer ->> 'ok' is distinct from 'true' then
      return null;
    end if;
    insert into pg_temp.test_guests (room_key, nick, player_token) values (p_key, v_nick, v_token);
  end loop;
  return v_room;
end;
$$;

-- A move of the room's host, made as the host; then the room's rounds are remembered.
create function pg_temp.host_moves(p_key text, p_sql text) returns text language plpgsql as $$
declare
  v_outcome text;
begin
  v_outcome := pg_temp.outcome(pg_temp.call_as('authenticated', pg_temp.host_of(p_key), p_sql));
  begin
    perform pg_temp.remember_rounds(p_key);
  exception when others then
    return 'moved, but the rounds could not be read: ' || sqlstate || ' ' || sqlerrm;
  end;
  return v_outcome;
end;
$$;

-- "Zacznij grę" as the room's host, with a real question id.
create function pg_temp.host_starts(p_key text) returns text language plpgsql as $$
begin
  return pg_temp.host_moves(p_key, format(
    'select public.start_game(%L, %L)', pg_temp.room_of(p_key), 'na-co-dzien-001'
  ));
end;
$$;

-- "Odsłoń wynik" as the room's host: p_round is the round on the host's screen.
create function pg_temp.host_reveals(p_key text, p_round integer) returns text language plpgsql as $$
begin
  return pg_temp.host_moves(p_key, format(
    'select public.reveal_round(%L, %s)', pg_temp.room_of(p_key), p_round
  ));
end;
$$;

-- "Następne pytanie" as the room's host: p_round is the round on the host's screen, p_candidates the Worker's pool.
create function pg_temp.host_next(p_key text, p_round integer, p_candidates text[]) returns text language plpgsql as $$
begin
  return pg_temp.host_moves(p_key, format(
    'select public.next_round(%L, %s, %L::text[])', pg_temp.room_of(p_key), p_round, p_candidates
  ));
end;
$$;

-- "Pomiń pytanie" as the room's host.
create function pg_temp.host_skips(p_key text, p_round integer, p_candidates text[]) returns text language plpgsql as $$
begin
  return pg_temp.host_moves(p_key, format(
    'select public.skip_round(%L, %s, %L::text[])', pg_temp.room_of(p_key), p_round, p_candidates
  ));
end;
$$;

-- "Zakończ grę" as the room's host.
create function pg_temp.host_ends(p_key text) returns text language plpgsql as $$
begin
  return pg_temp.host_moves(p_key, format('select public.end_game(%L)', pg_temp.room_of(p_key)));
end;
$$;

-- A guest of the room votes with its own token; a null target is an abstention. Like host_votes, with the number of
-- the question on the voter's screen (p_round), as the room screen sends it.
create function pg_temp.guest_votes(p_key text, p_nick text, p_target text, p_round integer) returns text
language plpgsql as $$
declare
  v_token text;
begin
  select g.player_token into v_token from pg_temp.test_guests g where g.room_key = p_key and g.nick = p_nick;
  return pg_temp.outcome(pg_temp.call_as('anon', null, format(
    'select public.cast_vote(%L, %L, %L, %s)', pg_temp.room_of(p_key), p_target, v_token, p_round
  )));
end;
$$;

-- The room's host votes by its session (no token).
create function pg_temp.host_votes(p_key text, p_target text, p_round integer) returns text language plpgsql as $$
begin
  return pg_temp.outcome(pg_temp.call_as('authenticated', pg_temp.host_of(p_key), format(
    'select public.cast_vote(%L, %L, null, %s)', pg_temp.room_of(p_key), p_target, p_round
  )));
end;
$$;

-- "Nowa gra" as the room's host, with the "guests are still in it" question answered: closes the room.
create function pg_temp.host_opens_new_room(p_key text) returns text language plpgsql as $$
begin
  return pg_temp.outcome(pg_temp.call_as('authenticated', pg_temp.host_of(p_key), format(
    'select public.create_room(%L, %L, array[%L], array[]::text[], true)',
    'Host', substr(md5(random()::text), 1, 22), 'na-co-dzien'
  )));
end;
$$;

-- Rows in one urn table, as text: a count, or why there is none to give. Of every round of the room seen so far, or of
-- round p_number only, so a new round's empty urn is never counted as a leftover of the one before it.
create function pg_temp.urn_rows(p_table text, p_key text, p_number integer default null) returns text
language plpgsql as $$
declare
  v_ids uuid[];
  v_count bigint;
begin
  if to_regclass(format('private.%I', p_table)) is null then
    return 'no table private.' || p_table;
  end if;
  perform pg_temp.remember_rounds(p_key);
  select array_agg(t.round_id) into v_ids
  from pg_temp.test_rounds t
  where t.room_key = p_key and (p_number is null or t.number = p_number);
  if coalesce(cardinality(v_ids), 0) = 0 then
    return coalesce('no round ' || p_number || ' in this room', 'no round was started in this room');
  end if;
  execute format('select count(*) from private.%I u where u.round_id = any($1)', p_table)
    into v_count using v_ids;
  return v_count::text;
exception when others then
  return 'error ' || sqlstate || ': ' || sqlerrm;
end;
$$;

-- The phase of the room's round p_number.
create function pg_temp.round_phase(p_key text, p_number integer) returns text language plpgsql as $$
declare
  v_id uuid;
  v_phase text;
begin
  if to_regclass('private.rounds') is null then
    return 'no table private.rounds';
  end if;
  perform pg_temp.remember_rounds(p_key);
  v_id := pg_temp.round_id_of(p_key, p_number);
  if v_id is null then
    return 'no round ' || p_number || ' in this room';
  end if;
  execute 'select r.phase::text from private.rounds r where r.id = $1' into v_phase using v_id;
  return coalesce(v_phase, 'the round row is gone');
exception when others then
  return 'error ' || sqlstate || ': ' || sqlerrm;
end;
$$;

-- What a crash does to one room's round: the unlogged urn tables lose their rows and the logged round stays in voting.
-- A real crash empties both tables whole; this file deletes only its own room's rows.
create function pg_temp.crash_urn(p_key text) returns text language plpgsql as $$
declare
  v_ids uuid[];
begin
  perform pg_temp.remember_rounds(p_key);
  select array_agg(t.round_id) into v_ids from pg_temp.test_rounds t where t.room_key = p_key;
  if coalesce(cardinality(v_ids), 0) = 0 then
    return 'no round was started in this room';
  end if;
  execute 'delete from private.ballot_boxes b where b.round_id = any($1)' using v_ids;
  execute 'delete from private.round_voters v where v.round_id = any($1)' using v_ids;
  return 'emptied';
exception when others then
  return 'error ' || sqlstate || ': ' || sqlerrm;
end;
$$;

-- The revealed result of the room's round p_number as one line: every counted player by nick, then the abstentions
-- and the ballots.
create function pg_temp.results_of(p_key text, p_number integer) returns text language plpgsql as $$
declare
  v_id uuid;
  v_results text;
begin
  perform pg_temp.remember_rounds(p_key);
  v_id := pg_temp.round_id_of(p_key, p_number);
  if v_id is null then
    return 'no round ' || p_number || ' in this room';
  end if;
  execute $q$
    select string_agg(p.nick || ' ' || rr.votes, ', ' order by p.nick)
      || ' | abstained ' || max(r.abstained) || ' | ballots ' || max(r.ballots)
    from private.rounds r
    join private.round_results rr on rr.round_id = r.id
    join public.players p on p.id = rr.player_id
    where r.id = $1
  $q$ into v_results using v_id;
  return coalesce(v_results, 'no results');
exception when others then
  return 'error ' || sqlstate || ': ' || sqlerrm;
end;
$$;

-- Every count the room's round p_number keeps: the abstentions and the ballots (set at the reveal, never before) and
-- its rows in private.round_results. A round that ended without a reveal keeps 'abstained none | ballots none |
-- results 0'.
create function pg_temp.round_counts(p_key text, p_number integer) returns text language plpgsql as $$
declare
  v_id uuid;
  v_counts text;
begin
  perform pg_temp.remember_rounds(p_key);
  v_id := pg_temp.round_id_of(p_key, p_number);
  if v_id is null then
    return 'no round ' || p_number || ' in this room';
  end if;
  execute $q$
    select 'abstained ' || coalesce(r.abstained::text, 'none')
      || ' | ballots ' || coalesce(r.ballots::text, 'none')
      || ' | results ' || (select count(*) from private.round_results rr where rr.round_id = r.id)
    from private.rounds r
    where r.id = $1
  $q$ into v_counts using v_id;
  return coalesce(v_counts, 'the round row is gone');
exception when others then
  return 'error ' || sqlstate || ': ' || sqlerrm;
end;
$$;

-- Whether a private table is in the Realtime publication, which would send its rows to every subscriber.
create function pg_temp.publication_of(p_table text) returns text language sql as $$
  select case
    when to_regclass(format('private.%I', p_table)) is null then 'no table private.' || p_table
    when exists (
      select 1 from pg_catalog.pg_publication_tables t
      where t.pubname = 'supabase_realtime' and t.schemaname = 'private' and t.tablename = p_table
    ) then 'in supabase_realtime'
    else 'not published'
  end
$$;

-- Columns that would put an order on the rows (a time, a serial default or an identity): 'none', or the list.
create function pg_temp.order_columns(p_table text) returns text language sql as $$
  select case
    when to_regclass(format('private.%I', p_table)) is null then 'no table private.' || p_table
    else coalesce((
      select string_agg(a.attname || ' ' || pg_catalog.format_type(a.atttypid, a.atttypmod), ', ' order by a.attnum)
      from pg_catalog.pg_attribute a
      join pg_catalog.pg_type ty on ty.oid = a.atttypid
      left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attrelid = to_regclass(format('private.%I', p_table))
        and a.attnum > 0
        and not a.attisdropped
        and (
          -- D: date and time types; T: interval.
          ty.typcategory in ('D', 'T')
          or a.attidentity <> ''
          or pg_catalog.pg_get_expr(d.adbin, d.adrelid) like 'nextval(%'
        )
    ), 'none')
  end
$$;

-- Every table and view of schema private, today's and any later one, that fails one check: 'none', or their names.
-- 'grants': any privilege of anon or authenticated, on the table or a column of it; 'published': in
-- supabase_realtime; 'order': a time, serial or identity column. The scan must see private.rounds, or it proves
-- nothing.
create function pg_temp.private_tables_failing(p_check text) returns text language plpgsql as $$
declare
  v_tables text[];
  v_failing text;
begin
  if p_check not in ('grants', 'published', 'order') then
    return 'unknown check ' || p_check;
  end if;
  select array_agg(c.relname::text order by c.relname) into v_tables
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'private' and c.relkind in ('r', 'p', 'v', 'm', 'f');
  if not ('rounds' = any (coalesce(v_tables, '{}'))) then
    return 'private.rounds is not among the tables of schema private';
  end if;
  select string_agg(t.name, ', ' order by t.name) into v_failing
  from unnest(v_tables) as t (name)
  where case p_check
    when 'grants' then exists (
      select 1
      from unnest(array['anon', 'authenticated']) as g (role_name)
      where has_table_privilege(
          g.role_name, format('private.%I', t.name), 'select,insert,update,delete,truncate,references,trigger'
        )
        or has_any_column_privilege(g.role_name, format('private.%I', t.name), 'select,insert,update,references')
    )
    when 'published' then exists (
      select 1 from pg_catalog.pg_publication_tables p
      where p.pubname = 'supabase_realtime' and p.schemaname = 'private' and p.tablename = t.name
    )
    else pg_temp.order_columns(t.name) <> 'none'
  end;
  return coalesce(v_failing, 'none');
end;
$$;

-- How a function runs and who may call it, as one line: definer or invoker, owner, settings (search_path), and which
-- of anon, authenticated and PUBLIC hold execute. 'no function <signature>' when it is missing.
create function pg_temp.function_facts(p_signature text) returns text language plpgsql as $$
declare
  v_fn regprocedure := to_regprocedure(p_signature);
  v_facts text;
begin
  if v_fn is null then
    return 'no function ' || p_signature;
  end if;
  select concat_ws(' | ',
    case when p.prosecdef then 'security definer' else 'security invoker' end,
    'owner ' || pg_catalog.pg_get_userbyid(p.proowner),
    coalesce(array_to_string(p.proconfig, ', '), 'no settings'),
    'execute: ' || coalesce((
      select string_agg(g.grantee, ', ' order by g.grantee)
      from (values ('anon'), ('authenticated'), ('public')) as g (grantee)
      where case g.grantee
        when 'public' then exists (
          select 1 from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
          where a.grantee = 0 and a.privilege_type = 'EXECUTE'
        )
        else has_function_privilege(g.grantee, p.oid, 'execute')
      end
    ), 'nobody')
  )
  into v_facts
  from pg_catalog.pg_proc p
  where p.oid = v_fn;
  return v_facts;
end;
$$;

create function pg_temp.cron_job(p_name text) returns text language plpgsql as $$
declare
  v_job text;
begin
  if to_regclass('cron.job') is null then
    return 'no table cron.job';
  end if;
  execute 'select string_agg(j.schedule || '' | '' || j.command, ''; '') from cron.job j where j.jobname = $1'
    into v_job using p_name;
  return coalesce(v_job, 'no job ' || p_name);
exception when others then
  return 'error ' || sqlstate || ': ' || sqlerrm;
end;
$$;

-- Every version of a function of schema public as 'name(arguments)', '; ' between them: one version is one of them.
create function pg_temp.versions_of(p_name text) returns text language sql as $$
  select coalesce(
    string_agg(p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')', '; '),
    'no function public.' || p_name
  )
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = p_name
$$;

-- S-08: two latecomers ask to join the room's game in play through request_join, as anon with fresh 43-character
-- tokens, and the room's host turns the second one away through reject_latecomer, so the room holds one pending and one
-- rejected request. 'ok', or the first answer that was not.
create function pg_temp.latecomers_ask(p_key text) returns text language plpgsql as $$
declare
  v_link text;
  v_nick text;
  v_outcome text;
begin
  select r.link_token into v_link from public.rooms r where r.id = pg_temp.room_of(p_key);
  foreach v_nick in array array['Kuba', 'Wiktor'] loop
    v_outcome := pg_temp.outcome(pg_temp.call_as('anon', null, format(
      'select public.request_join(%L, %L, %L)',
      v_link, v_nick, md5(random()::text) || substr(md5(random()::text), 1, 11)
    )));
    if v_outcome <> 'ok' then
      return 'request_join as ' || v_nick || ': ' || v_outcome;
    end if;
  end loop;
  v_outcome := pg_temp.outcome(pg_temp.call_as('authenticated', pg_temp.host_of(p_key), format(
    'select public.reject_latecomer(%L, %L)', pg_temp.room_of(p_key), 'Wiktor'
  )));
  if v_outcome <> 'ok' then
    return 'reject_latecomer as the host: ' || v_outcome;
  end if;
  return 'ok';
end;
$$;

-- The room's rows in public.join_requests per status, as one line ('pending 1, rejected 1'), 'none', or why there is
-- no count to give.
create function pg_temp.join_request_rows(p_key text) returns text language plpgsql as $$
declare
  v_rows text;
begin
  if to_regclass('public.join_requests') is null then
    return 'no table public.join_requests';
  end if;
  if pg_temp.room_of(p_key) is null then
    return 'no room ' || p_key;
  end if;
  execute $q$
    select string_agg(s.status || ' ' || s.n, ', ' order by s.status)
    from (
      select q.status, count(*) as n from public.join_requests q where q.room_id = $1 group by q.status
    ) s
  $q$ into v_rows using pg_temp.room_of(p_key);
  return coalesce(v_rows, 'none');
exception when others then
  return 'error ' || sqlstate || ': ' || sqlerrm;
end;
$$;

-- S-06: the room's host reviews the game's question list as the host: open_question_list with the first 15 questions
-- of the base, remove_list_question of position 2 and add_own_question, so the room's list holds 16 rows, one of them
-- removed and one of them the host's own. 'ok', or the first answer that was not.
create function pg_temp.host_reviews_list(p_key text) returns text language plpgsql as $$
declare
  v_outcome text;
begin
  v_outcome := pg_temp.outcome(pg_temp.call_as('authenticated', pg_temp.host_of(p_key), format(
    'select public.open_question_list(%L, %L::text[])',
    pg_temp.room_of(p_key),
    array(select format('na-co-dzien-%s', lpad(n::text, 3, '0')) from generate_series(1, 15) as n)
  )));
  if v_outcome <> 'ok' then
    return 'open_question_list as the host: ' || v_outcome;
  end if;
  v_outcome := pg_temp.outcome(pg_temp.call_as('authenticated', pg_temp.host_of(p_key), format(
    'select public.remove_list_question(%L, 2)', pg_temp.room_of(p_key)
  )));
  if v_outcome <> 'ok' then
    return 'remove_list_question as the host: ' || v_outcome;
  end if;
  v_outcome := pg_temp.outcome(pg_temp.call_as('authenticated', pg_temp.host_of(p_key), format(
    'select public.add_own_question(%L, %L)', pg_temp.room_of(p_key), 'pytanie dopisane przez hosta'
  )));
  if v_outcome <> 'ok' then
    return 'add_own_question as the host: ' || v_outcome;
  end if;
  return 'ok';
end;
$$;

-- The room's rows in private.game_questions as one line ('16 rows, 1 removed, 1 own'), 'none', or why there is no
-- count to give.
create function pg_temp.list_rows(p_key text) returns text language plpgsql as $$
declare
  v_rows text;
begin
  if to_regclass('private.game_questions') is null then
    return 'no table private.game_questions';
  end if;
  if pg_temp.room_of(p_key) is null then
    return 'no room ' || p_key;
  end if;
  execute $q$
    select case when count(*) = 0 then 'none' else
      count(*)::text || ' rows, '
        || (count(*) filter (where g.removed))::text || ' removed, '
        || (count(*) filter (where g.question_id is null))::text || ' own'
    end
    from private.game_questions g
    where g.room_id = $1
  $q$ into v_rows using pg_temp.room_of(p_key);
  return v_rows;
exception when others then
  return 'error ' || sqlstate || ': ' || sqlerrm;
end;
$$;

-- S-11: "Zacznij grę" as the room's host, with the question p_question: each scenario of the counters plays questions
-- of its own.
create function pg_temp.host_starts_with(p_key text, p_question text) returns text language plpgsql as $$
begin
  return pg_temp.host_moves(p_key, format(
    'select public.start_game(%L, %L)', pg_temp.room_of(p_key), p_question
  ));
end;
$$;

-- S-11: a thumb of a guest of the room with its own token: p_reaction 'up', 'down' or 'none', on round p_round, the
-- round on the guest's screen.
create function pg_temp.guest_reacts(p_key text, p_nick text, p_reaction text, p_round integer) returns text
language plpgsql as $$
declare
  v_token text;
begin
  select g.player_token into v_token from pg_temp.test_guests g where g.room_key = p_key and g.nick = p_nick;
  return pg_temp.outcome(pg_temp.call_as('anon', null, format(
    'select public.react_round(%L, %s, %L, %L)', pg_temp.room_of(p_key), p_round, p_reaction, v_token
  )));
end;
$$;

-- S-11: the thumb of the room's host, by its session (no token).
create function pg_temp.host_reacts(p_key text, p_reaction text, p_round integer) returns text language plpgsql as $$
begin
  return pg_temp.outcome(pg_temp.call_as('authenticated', pg_temp.host_of(p_key), format(
    'select public.react_round(%L, %s, %L)', pg_temp.room_of(p_key), p_round, p_reaction
  )));
end;
$$;

-- S-11: the room's host prepares the game's question list as the host: open_question_list with p_candidates, then
-- edit_list_question of each position in p_reworded, then remove_list_question of each position in p_removed (so an
-- entry may be reworded and then removed), and add_own_question when p_own. 'ok', or the first answer that was not.
create function pg_temp.host_prepares_list(
  p_key text, p_candidates text[], p_reworded integer[], p_removed integer[], p_own boolean
) returns text language plpgsql as $$
declare
  v_position integer;
  v_outcome text;
begin
  v_outcome := pg_temp.outcome(pg_temp.call_as('authenticated', pg_temp.host_of(p_key), format(
    'select public.open_question_list(%L, %L::text[])', pg_temp.room_of(p_key), p_candidates
  )));
  if v_outcome <> 'ok' then
    return 'open_question_list as the host: ' || v_outcome;
  end if;
  foreach v_position in array p_reworded loop
    v_outcome := pg_temp.outcome(pg_temp.call_as('authenticated', pg_temp.host_of(p_key), format(
      'select public.edit_list_question(%L, %s, %L)',
      pg_temp.room_of(p_key), v_position, 'pytanie poprawione przez hosta'
    )));
    if v_outcome <> 'ok' then
      return 'edit_list_question of position ' || v_position || ' as the host: ' || v_outcome;
    end if;
  end loop;
  foreach v_position in array p_removed loop
    v_outcome := pg_temp.outcome(pg_temp.call_as('authenticated', pg_temp.host_of(p_key), format(
      'select public.remove_list_question(%L, %s)', pg_temp.room_of(p_key), v_position
    )));
    if v_outcome <> 'ok' then
      return 'remove_list_question of position ' || v_position || ' as the host: ' || v_outcome;
    end if;
  end loop;
  if p_own then
    v_outcome := pg_temp.outcome(pg_temp.call_as('authenticated', pg_temp.host_of(p_key), format(
      'select public.add_own_question(%L, %L)', pg_temp.room_of(p_key), 'pytanie dopisane przez hosta'
    )));
    if v_outcome <> 'ok' then
      return 'add_own_question as the host: ' || v_outcome;
    end if;
  end if;
  return 'ok';
end;
$$;

-- S-11: the counters of private.question_stats are global, and the Vitest suite before this file plays the same
-- question ids, so a scenario checks what its moves added: snapshot_stats remembers the counters of the given questions
-- now ('{}' for a question with no row yet), and stats_gain says what each of them gained since.
create temp table stats_before (question_id text primary key, counters jsonb not null);

-- 'ok', or why the counters could not be read.
create function pg_temp.snapshot_stats(variadic p_questions text[]) returns text language plpgsql as $$
begin
  if to_regclass('private.question_stats') is null then
    return 'no table private.question_stats';
  end if;
  delete from pg_temp.stats_before b where b.question_id = any (p_questions);
  execute $q$
    insert into pg_temp.stats_before (question_id, counters)
    select q.id, coalesce((select to_jsonb(s) from private.question_stats s where s.question_id = q.id), '{}')
    from unnest($1) as q (id)
  $q$ using p_questions;
  return 'ok';
exception when others then
  return 'error ' || sqlstate || ': ' || sqlerrm;
end;
$$;

-- What each question's counters gained since its snapshot, as one line: '<id>: <counter> +<n>, …' in the table's
-- column order, or '<id>: no change', the questions joined by '; '. Every counter is read, so one that moved where the
-- scenario expects nothing shows too.
create function pg_temp.stats_gain(variadic p_questions text[]) returns text language plpgsql as $$
declare
  v_question text;
  v_before jsonb;
  v_now jsonb;
  v_moved text;
  v_lines text[] := '{}';
begin
  if to_regclass('private.question_stats') is null then
    return 'no table private.question_stats';
  end if;
  foreach v_question in array p_questions loop
    select b.counters into v_before from pg_temp.stats_before b where b.question_id = v_question;
    if v_before is null then
      return 'no snapshot of ' || v_question;
    end if;
    execute 'select to_jsonb(s) from private.question_stats s where s.question_id = $1' into v_now using v_question;
    select string_agg(c.name || ' ' || case when d.gain > 0 then '+' else '' end || d.gain, ', ' order by c.place)
    into v_moved
    from unnest(array[
      'revealed', 'eligible', 'ballots', 'abstained', 'scored', 'scored_eligible', 'scored_votes', 'scored_top',
      'skipped', 'listed', 'removed', 'thumbs_up', 'thumbs_down'
    ]) with ordinality as c (name, place)
    cross join lateral (
      select coalesce((v_now ->> c.name)::integer, 0) - coalesce((v_before ->> c.name)::integer, 0) as gain
    ) d
    where d.gain <> 0;
    v_lines := v_lines || (v_question || ': ' || coalesce(v_moved, 'no change'));
  end loop;
  return array_to_string(v_lines, '; ');
exception when others then
  return 'error ' || sqlstate || ': ' || sqlerrm;
end;
$$;

-- S-11: every version of a function of schema private, as versions_of does for schema public.
create function pg_temp.private_versions_of(p_name text) returns text language sql as $$
  select coalesce(
    string_agg(p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')', '; '),
    'no function private.' || p_name
  )
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = p_name
$$;

-- S-07: the SQLSTATE a statement run as the owner raises, or 'no error'. Either way nothing it did stays: a statement
-- that succeeds is undone by the exception raised after it.
create function pg_temp.owner_error(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  raise exception 'statement ran' using errcode = 'P0001';
exception when others then
  return case when sqlstate = 'P0001' and sqlerrm = 'statement ran' then 'no error' else sqlstate end;
end;
$$;

-- Positive control (green from day one) -------------------------------------------------------------------------------

-- If this fails, the file reads the wrong database or the owner's view is broken: nothing below means anything.
select table_privs_are(
  'public', 'player_secrets', 'anon', array[]::name[],
  'positive control: anon has no privilege on public.player_secrets'
);

-- Catalog: the urn's tables ------------------------------------------------------------------------------------------

-- Unlogged: never written to the WAL, so no replica, logical decoding or backup holds a round in progress.
select is(
  (select c.relpersistence::text from pg_catalog.pg_class c where c.oid = to_regclass('private.ballot_boxes')),
  'u',
  'private.ballot_boxes is unlogged'
);
select is(
  (select c.relpersistence::text from pg_catalog.pg_class c where c.oid = to_regclass('private.round_voters')),
  'u',
  'private.round_voters is unlogged'
);

-- No API role reaches a round table directly: only the functions do.
select table_privs_are('private', 'rounds', 'anon', array[]::name[], 'anon has no privilege on private.rounds');
select table_privs_are(
  'private', 'rounds', 'authenticated', array[]::name[], 'authenticated has no privilege on private.rounds'
);
select table_privs_are(
  'private', 'round_results', 'anon', array[]::name[], 'anon has no privilege on private.round_results'
);
select table_privs_are(
  'private', 'round_results', 'authenticated', array[]::name[],
  'authenticated has no privilege on private.round_results'
);
select table_privs_are(
  'private', 'ballot_boxes', 'anon', array[]::name[], 'anon has no privilege on private.ballot_boxes'
);
select table_privs_are(
  'private', 'ballot_boxes', 'authenticated', array[]::name[], 'authenticated has no privilege on private.ballot_boxes'
);
select table_privs_are(
  'private', 'round_voters', 'anon', array[]::name[], 'anon has no privilege on private.round_voters'
);
select table_privs_are(
  'private', 'round_voters', 'authenticated', array[]::name[], 'authenticated has no privilege on private.round_voters'
);
-- S-06: the game's question list, which a round of the game may come from, is reached only through the list's
-- functions too.
select table_privs_are(
  'private', 'game_questions', 'anon', array[]::name[], 'anon has no privilege on private.game_questions'
);
select table_privs_are(
  'private', 'game_questions', 'authenticated', array[]::name[],
  'authenticated has no privilege on private.game_questions'
);

-- Postgres Changes would send every row to anyone holding the publishable key.
select is(pg_temp.publication_of('rounds'), 'not published', 'private.rounds is not in supabase_realtime');
select is(
  pg_temp.publication_of('round_results'), 'not published', 'private.round_results is not in supabase_realtime'
);
select is(pg_temp.publication_of('ballot_boxes'), 'not published', 'private.ballot_boxes is not in supabase_realtime');
select is(pg_temp.publication_of('round_voters'), 'not published', 'private.round_voters is not in supabase_realtime');
select is(
  pg_temp.publication_of('game_questions'), 'not published', 'private.game_questions is not in supabase_realtime'
);

-- A time or a sequence next to a vote would tell the order of voting, and with it who voted for whom.
select is(pg_temp.order_columns('rounds'), 'none', 'private.rounds has no time, serial or identity column');
select is(
  pg_temp.order_columns('round_results'), 'none', 'private.round_results has no time, serial or identity column'
);
select is(pg_temp.order_columns('ballot_boxes'), 'none', 'private.ballot_boxes has no time, serial or identity column');
select is(pg_temp.order_columns('round_voters'), 'none', 'private.round_voters has no time, serial or identity column');
select is(
  pg_temp.order_columns('game_questions'), 'none', 'private.game_questions has no time, serial or identity column'
);

-- What stays after the reveal is a count per target, with no voter; who voted is never stored next to a target.
select columns_are(
  'private', 'round_results', array['round_id', 'player_id', 'votes'],
  'private.round_results has only round_id, player_id (the target) and votes: no voter column'
);
select columns_are(
  'private', 'round_voters', array['round_id', 'player_id'],
  'private.round_voters has only round_id and player_id (the voter): no target column'
);

-- The schema is reached only through security definer functions.
select ok(
  not has_schema_privilege('authenticated', 'private', 'usage'),
  'authenticated has no usage on schema private'
);

-- The same, for every table of schema private: the ones above by name, and any later one by this scan (S-03 adds none,
-- so the scan holds from the start; S-06's private.game_questions is checked both ways).
select is(
  pg_temp.private_tables_failing('grants'), 'none',
  'no table of schema private grants anything to anon or authenticated'
);
select is(pg_temp.private_tables_failing('published'), 'none', 'no table of schema private is in supabase_realtime');
select is(
  pg_temp.private_tables_failing('order'), 'none', 'no table of schema private has a time, serial or identity column'
);

-- Catalog: the evening's functions -----------------------------------------------------------------------------------

-- A security definer function runs as its owner: postgres, with an empty search_path, and only the role the game needs
-- may call it. Positive control first: S-02's start_game passes the same check, so a red one below is the function's,
-- not the check's. S-07 (*_co_host_role.sql): the leader's moves take p_player_token and are granted to anon too, since
-- a co-host is a guest with no session; every check stays inside them.
select is(
  pg_temp.function_facts('public.start_game(uuid, text, text)'),
  'security definer | owner postgres | search_path="" | execute: anon, authenticated',
  'positive control of the check: start_game with p_player_token runs as postgres with an empty search_path, for anon '
    || 'and authenticated'
);
select is(
  pg_temp.function_facts('public.next_round(uuid, integer, text[], text)'),
  'security definer | owner postgres | search_path="" | execute: anon, authenticated',
  'next_round with p_player_token runs as postgres with an empty search_path, for anon and authenticated'
);
select is(
  pg_temp.function_facts('public.skip_round(uuid, integer, text[], text)'),
  'security definer | owner postgres | search_path="" | execute: anon, authenticated',
  'skip_round with p_player_token runs as postgres with an empty search_path, for anon and authenticated'
);
select is(
  pg_temp.function_facts('public.end_game(uuid, text)'),
  'security definer | owner postgres | search_path="" | execute: anon, authenticated',
  'end_game with p_player_token runs as postgres with an empty search_path, for anon and authenticated'
);
select is(
  pg_temp.function_facts('public.cast_vote(uuid, text, text, integer)'),
  'security definer | owner postgres | search_path="" | execute: anon, authenticated',
  'cast_vote with p_round runs as postgres with an empty search_path, for anon and authenticated'
);
select is(
  pg_temp.function_facts('public.reveal_round(uuid, integer, text)'),
  'security definer | owner postgres | search_path="" | execute: anon, authenticated',
  'reveal_round with p_round and p_player_token runs as postgres with an empty search_path, for anon and authenticated'
);

-- Two versions side by side would be a back door: the one without p_round would take a vote into a skipped round.
select is(
  (
    select string_agg(p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')', '; ')
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'cast_vote'
  ),
  'cast_vote(p_room_id uuid, p_target text, p_player_token text, p_round integer)',
  'cast_vote exists in exactly one version, the one with p_round'
);

-- The same for the reveal (deferred-review-fixes, F2): the one without p_round would reveal a question the host's
-- screen has not shown. S-07 adds p_player_token, in the same one version.
select is(
  (
    select string_agg(p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')', '; ')
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'reveal_round'
  ),
  'reveal_round(p_room_id uuid, p_round integer, p_player_token text)',
  'reveal_round exists in exactly one version, the one with p_round and p_player_token'
);

-- S-07: the version of a leader's move without p_player_token, beside the new one, would be a door the leader's check
-- does not guard.
select is(
  pg_temp.versions_of('next_round'),
  'next_round(p_room_id uuid, p_round integer, p_candidates text[], p_player_token text)',
  'next_round exists in exactly one version, the one with p_player_token'
);
select is(
  pg_temp.versions_of('skip_round'),
  'skip_round(p_room_id uuid, p_round integer, p_candidates text[], p_player_token text)',
  'skip_round exists in exactly one version, the one with p_player_token'
);
select is(
  pg_temp.versions_of('end_game'),
  'end_game(p_room_id uuid, p_player_token text)',
  'end_game exists in exactly one version, the one with p_player_token'
);

-- Catalog: requests to join a game in play (S-08) -------------------------------------------------------------------

-- A request holds a latecomer's token hash: like public.player_secrets, no API role reaches the table, only the
-- functions do, and Postgres Changes never sends its rows to anyone holding the publishable key.
select table_privs_are(
  'public', 'join_requests', 'anon', array[]::name[], 'anon has no privilege on public.join_requests'
);
select table_privs_are(
  'public', 'join_requests', 'authenticated', array[]::name[], 'authenticated has no privilege on public.join_requests'
);
select is(
  (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = to_regclass('public.join_requests')),
  true,
  'public.join_requests has row level security on'
);
select is(
  case
    when to_regclass('public.join_requests') is null then 'no table public.join_requests'
    when exists (
      select 1 from pg_catalog.pg_publication_tables t
      where t.pubname = 'supabase_realtime' and t.schemaname = 'public' and t.tablename = 'join_requests'
    ) then 'in supabase_realtime'
    else 'not published'
  end,
  'not published',
  'public.join_requests is not in supabase_realtime'
);

-- The latecomer has no session: asking and its own request's state are public endpoints, with every check inside.
-- Letting in and turning away are the leader's: the signed-in host's, and since S-07 a co-host's by its player token,
-- so they are public endpoints too.
select is(
  pg_temp.function_facts('public.request_join(text, text, text)'),
  'security definer | owner postgres | search_path="" | execute: anon, authenticated',
  'request_join runs as postgres with an empty search_path, for anon and authenticated'
);
select is(
  pg_temp.function_facts('public.join_request_state(uuid, text)'),
  'security definer | owner postgres | search_path="" | execute: anon, authenticated',
  'join_request_state runs as postgres with an empty search_path, for anon and authenticated'
);
select is(
  pg_temp.function_facts('public.admit_latecomer(uuid, text, text)'),
  'security definer | owner postgres | search_path="" | execute: anon, authenticated',
  'admit_latecomer with p_player_token runs as postgres with an empty search_path, for anon and authenticated'
);
select is(
  pg_temp.function_facts('public.reject_latecomer(uuid, text, text)'),
  'security definer | owner postgres | search_path="" | execute: anon, authenticated',
  'reject_latecomer with p_player_token runs as postgres with an empty search_path, for anon and authenticated'
);

-- A second version beside any of these would be a door its checks do not guard.
select is(
  pg_temp.versions_of('request_join'),
  'request_join(p_link_token text, p_nick text, p_player_token text)',
  'request_join exists in exactly one version'
);
select is(
  pg_temp.versions_of('join_request_state'),
  'join_request_state(p_room_id uuid, p_player_token text)',
  'join_request_state exists in exactly one version'
);
select is(
  pg_temp.versions_of('admit_latecomer'),
  'admit_latecomer(p_room_id uuid, p_nick text, p_player_token text)',
  'admit_latecomer exists in exactly one version, the one with p_player_token'
);
select is(
  pg_temp.versions_of('reject_latecomer'),
  'reject_latecomer(p_room_id uuid, p_nick text, p_player_token text)',
  'reject_latecomer exists in exactly one version, the one with p_player_token'
);

-- Catalog: the game's question list (S-06) ---------------------------------------------------------------------------

-- The list is the signed-in host's to review, in the lobby: every move on it runs as postgres with an empty
-- search_path, for authenticated only, and checks the host and the room's status inside.
select is(
  pg_temp.function_facts('public.open_question_list(uuid, text[])'),
  'security definer | owner postgres | search_path="" | execute: authenticated',
  'open_question_list runs as postgres with an empty search_path, for authenticated only'
);
select is(
  pg_temp.function_facts('public.draw_list_question(uuid, text[])'),
  'security definer | owner postgres | search_path="" | execute: authenticated',
  'draw_list_question runs as postgres with an empty search_path, for authenticated only'
);
select is(
  pg_temp.function_facts('public.remove_list_question(uuid, integer)'),
  'security definer | owner postgres | search_path="" | execute: authenticated',
  'remove_list_question runs as postgres with an empty search_path, for authenticated only'
);
select is(
  pg_temp.function_facts('public.edit_list_question(uuid, integer, text)'),
  'security definer | owner postgres | search_path="" | execute: authenticated',
  'edit_list_question runs as postgres with an empty search_path, for authenticated only'
);
select is(
  pg_temp.function_facts('public.add_own_question(uuid, text)'),
  'security definer | owner postgres | search_path="" | execute: authenticated',
  'add_own_question runs as postgres with an empty search_path, for authenticated only'
);

-- A second version beside any of these would be a door its checks do not guard. start_game and room_lobby, replaced by
-- the same migration, keep their one version; start_game's is the one with p_player_token since S-07.
select is(
  pg_temp.versions_of('open_question_list'),
  'open_question_list(p_room_id uuid, p_candidates text[])',
  'open_question_list exists in exactly one version'
);
select is(
  pg_temp.versions_of('draw_list_question'),
  'draw_list_question(p_room_id uuid, p_candidates text[])',
  'draw_list_question exists in exactly one version'
);
select is(
  pg_temp.versions_of('remove_list_question'),
  'remove_list_question(p_room_id uuid, p_position integer)',
  'remove_list_question exists in exactly one version'
);
select is(
  pg_temp.versions_of('edit_list_question'),
  'edit_list_question(p_room_id uuid, p_position integer, p_text text)',
  'edit_list_question exists in exactly one version'
);
select is(
  pg_temp.versions_of('add_own_question'),
  'add_own_question(p_room_id uuid, p_text text)',
  'add_own_question exists in exactly one version'
);
select is(
  pg_temp.versions_of('start_game'),
  'start_game(p_room_id uuid, p_question_id text, p_player_token text)',
  'start_game still exists in exactly one version, the one with p_player_token'
);
select is(
  pg_temp.versions_of('room_lobby'),
  'room_lobby(p_room_id uuid, p_player_token text)',
  'room_lobby still exists in exactly one version'
);

-- Catalog: the thumbs and the question counters (S-11) ---------------------------------------------------------------

-- A thumb is in-progress state like the urn: unlogged, so no replica, logical decoding or backup holds one. The
-- counters are what stays of the game's questions, so they are logged.
select is(
  (select c.relpersistence::text from pg_catalog.pg_class c where c.oid = to_regclass('private.round_reactions')),
  'u',
  'private.round_reactions is unlogged'
);
select is(
  (select c.relpersistence::text from pg_catalog.pg_class c where c.oid = to_regclass('private.question_stats')),
  'p',
  'private.question_stats is logged'
);

-- No API role reaches them: only the round functions do.
select table_privs_are(
  'private', 'round_reactions', 'anon', array[]::name[], 'anon has no privilege on private.round_reactions'
);
select table_privs_are(
  'private', 'round_reactions', 'authenticated', array[]::name[],
  'authenticated has no privilege on private.round_reactions'
);
select table_privs_are(
  'private', 'question_stats', 'anon', array[]::name[], 'anon has no privilege on private.question_stats'
);
select table_privs_are(
  'private', 'question_stats', 'authenticated', array[]::name[],
  'authenticated has no privilege on private.question_stats'
);
select table_privs_are(
  'private', 'stats_excluded_hosts', 'anon', array[]::name[], 'anon has no privilege on private.stats_excluded_hosts'
);
select table_privs_are(
  'private', 'stats_excluded_hosts', 'authenticated', array[]::name[],
  'authenticated has no privilege on private.stats_excluded_hosts'
);

select is(
  pg_temp.publication_of('round_reactions'), 'not published', 'private.round_reactions is not in supabase_realtime'
);
select is(
  pg_temp.publication_of('question_stats'), 'not published', 'private.question_stats is not in supabase_realtime'
);
select is(
  pg_temp.publication_of('stats_excluded_hosts'), 'not published',
  'private.stats_excluded_hosts is not in supabase_realtime'
);

-- A time next to a thumb would order the thumbs, and one next to a counter would date a game.
select is(
  pg_temp.order_columns('round_reactions'), 'none', 'private.round_reactions has no time, serial or identity column'
);
select is(
  pg_temp.order_columns('question_stats'), 'none', 'private.question_stats has no time, serial or identity column'
);
select is(
  pg_temp.order_columns('stats_excluded_hosts'), 'none',
  'private.stats_excluded_hosts has no time, serial or identity column'
);

-- The counters keep a question id and numbers, with no room, round or player; a thumb keeps its round, its player and
-- its direction, and nothing else.
select columns_are(
  'private', 'question_stats',
  array[
    'question_id', 'revealed', 'eligible', 'ballots', 'abstained', 'scored', 'scored_eligible', 'scored_votes',
    'scored_top', 'skipped', 'listed', 'removed', 'thumbs_up', 'thumbs_down'
  ],
  'private.question_stats has only the question id and its counters: no room, round or player'
);
select columns_are(
  'private', 'round_reactions', array['round_id', 'player_id', 'up'],
  'private.round_reactions has only round_id, player_id and up'
);
select columns_are(
  'private', 'stats_excluded_hosts', array['user_id'], 'private.stats_excluded_hosts has only user_id'
);

-- The thumb is every player's, guests included: a public endpoint for anon, with every check inside. The helpers run
-- only inside the round functions, as their caller.
select is(
  pg_temp.function_facts('public.react_round(uuid, integer, text, text)'),
  'security definer | owner postgres | search_path="" | execute: anon, authenticated',
  'react_round runs as postgres with an empty search_path, for anon and authenticated'
);
select is(
  pg_temp.function_facts('private.fold_reactions(uuid)'),
  'security invoker | owner postgres | search_path="" | execute: nobody',
  'private.fold_reactions runs as its caller with an empty search_path, and no API role may call it'
);
select is(
  pg_temp.function_facts('private.counts_for_stats(uuid)'),
  'security invoker | owner postgres | search_path="" | execute: nobody',
  'private.counts_for_stats runs as its caller with an empty search_path, and no API role may call it'
);

-- A second version beside any of these would be a door its checks do not guard.
select is(
  pg_temp.versions_of('react_round'),
  'react_round(p_room_id uuid, p_round integer, p_reaction text, p_player_token text)',
  'react_round exists in exactly one version'
);
select is(
  pg_temp.private_versions_of('fold_reactions'),
  'fold_reactions(p_room_id uuid)',
  'private.fold_reactions exists in exactly one version'
);
select is(
  pg_temp.private_versions_of('counts_for_stats'),
  'counts_for_stats(p_room_id uuid)',
  'private.counts_for_stats exists in exactly one version'
);

-- Catalog: the co-host (S-07) ----------------------------------------------------------------------------------------

-- Oracle: PRD FR-003 and Access Control (only the host gives and takes the role, to a guest of the room) and
-- context/changes/co-host-role/plan.md, Faza 1 #1 and #3. The role is a column of players that only set_cohost writes:
-- no API role gets more on players than before, and the host's own row never holds the role.
select is(
  (
    select c.data_type || ' | nullable ' || c.is_nullable || ' | default ' || coalesce(c.column_default, 'none')
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'players' and c.column_name = 'cohost'
  ),
  'boolean | nullable NO | default false',
  'public.players.cohost is a boolean, not null, false by default'
);
select table_privs_are(
  'public', 'players', 'anon', array[]::name[], 'anon has no privilege on public.players'
);
select table_privs_are(
  'public', 'players', 'authenticated', array['SELECT']::name[],
  'authenticated only reads public.players: the co-host role changes only through set_cohost'
);

select isnt(pg_temp.open_room('cohost-check', array['Ola']), null, 'setup: a host opens a room and Ola joins');
-- Positive control: the same update on a guest's row passes, so the refusal below is the check's, not the statement's.
select is(
  pg_temp.owner_error(format(
    'update public.players set cohost = true where room_id = %L and user_id is null', pg_temp.room_of('cohost-check')
  )),
  'no error',
  'positive control of the check: a guest''s row may hold the co-host role'
);
select is(
  pg_temp.owner_error(format(
    'update public.players set cohost = true where room_id = %L and user_id is not null',
    pg_temp.room_of('cohost-check')
  )),
  '23514',
  'the host''s own row never holds the co-host role: the check refuses it even to the owner'
);

-- Giving and taking the role is the signed-in host's. The leader's check runs only inside the definer functions, as
-- their caller.
select is(
  pg_temp.function_facts('public.set_cohost(uuid, text, boolean)'),
  'security definer | owner postgres | search_path="" | execute: authenticated',
  'set_cohost runs as postgres with an empty search_path, for authenticated only'
);
select is(
  pg_temp.function_facts('private.leader_refusal(uuid, uuid, text)'),
  'security invoker | owner postgres | search_path="" | execute: nobody',
  'private.leader_refusal runs as its caller with an empty search_path, and no API role may call it'
);
select is(
  pg_temp.versions_of('set_cohost'),
  'set_cohost(p_room_id uuid, p_nick text, p_cohost boolean)',
  'set_cohost exists in exactly one version'
);
select is(
  pg_temp.private_versions_of('leader_refusal'),
  'leader_refusal(p_room_id uuid, p_host uuid, p_player_token text)',
  'private.leader_refusal exists in exactly one version'
);

-- Catalog: the player's colour (S-18) --------------------------------------------------------------------------------

-- Oracle: PRD FR-025 and context/changes/player-color-choice/plan.md, Faza 1 #1 and #3. A colour is a number of the
-- game's palette of 20, required and with no default, so a way of adding a player that forgets it fails instead of
-- giving colour 0. Only the definer functions write it: the two table_privs_are of S-07 above still hold, so no API
-- role gets more on players than authenticated's select.
select is(
  (
    select c.data_type || ' | nullable ' || c.is_nullable || ' | default ' || coalesce(c.column_default, 'none')
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'players' and c.column_name = 'color'
  ),
  'smallint | nullable NO | default none',
  'public.players.color is a smallint, not null, with no default'
);

select isnt(pg_temp.open_room('color-check', array['Ola']), null, 'setup: a host opens a room and Ola joins');
-- Positive control: the same update with the palette's last colour passes, so the refusals below are the check's.
select is(
  pg_temp.owner_error(format(
    'update public.players set color = 19 where room_id = %L and user_id is null', pg_temp.room_of('color-check')
  )),
  'no error',
  'positive control of the check: a player''s colour may be 19, the palette''s last'
);
select is(
  pg_temp.owner_error(format(
    'update public.players set color = 20 where room_id = %L and user_id is null', pg_temp.room_of('color-check')
  )),
  '23514',
  'a colour past the palette (20) is refused by the check, even to the owner'
);
select is(
  pg_temp.owner_error(format(
    'update public.players set color = -1 where room_id = %L and user_id is null', pg_temp.room_of('color-check')
  )),
  '23514',
  'a colour below the palette (-1) is refused by the check, even to the owner'
);

-- A guest has no session: changing one's own colour is a public endpoint, with every check inside. The first free
-- colour runs only inside the definer functions that add a player, as their caller.
select is(
  pg_temp.function_facts('public.set_player_color(uuid, integer, text)'),
  'security definer | owner postgres | search_path="" | execute: anon, authenticated',
  'set_player_color runs as postgres with an empty search_path, for anon and authenticated'
);
select is(
  pg_temp.function_facts('private.free_color(uuid)'),
  'security invoker | owner postgres | search_path="" | execute: nobody',
  'private.free_color runs as its caller with an empty search_path, and no API role may call it'
);
select is(
  pg_temp.versions_of('set_player_color'),
  'set_player_color(p_room_id uuid, p_color integer, p_player_token text)',
  'set_player_color exists in exactly one version'
);
select is(
  pg_temp.private_versions_of('free_color'),
  'free_color(p_room_id uuid)',
  'private.free_color exists in exactly one version'
);

-- The ways in, replaced by the same migration, keep their one version and their grants: creating a room is the
-- signed-in host's, joining is anyone's with a link. admit_latecomer's version and grants and room_lobby's version are
-- checked above (S-08, S-06); room_lobby's grants here.
select is(
  pg_temp.function_facts('public.create_room(text, text, text[], text[], boolean)'),
  'security definer | owner postgres | search_path="" | execute: authenticated',
  'create_room still runs as postgres with an empty search_path, for authenticated only'
);
select is(
  pg_temp.function_facts('public.join_room(text, text, text)'),
  'security definer | owner postgres | search_path="" | execute: anon, authenticated',
  'join_room still runs as postgres with an empty search_path, for anon and authenticated'
);
select is(
  pg_temp.function_facts('public.room_lobby(uuid, text)'),
  'security definer | owner postgres | search_path="" | execute: anon, authenticated',
  'room_lobby still runs as postgres with an empty search_path, for anon and authenticated'
);
select is(
  pg_temp.versions_of('create_room'),
  'create_room(p_nick text, p_link_token text, p_categories text[], p_adult_categories text[], '
    || 'p_confirm_close boolean)',
  'create_room still exists in exactly one version'
);
select is(
  pg_temp.versions_of('join_room'),
  'join_room(p_link_token text, p_nick text, p_player_token text)',
  'join_room still exists in exactly one version'
);

-- A round played to the reveal leaves only counts -------------------------------------------------------------------

-- Host, Ola and Bartek: the third vote reveals the round by itself.
select isnt(
  pg_temp.open_room('revealed', array['Ola', 'Bartek']), null, 'setup: a host opens a room and 2 guests join'
);
select is(pg_temp.host_starts('revealed'), 'ok', 'start_game as the host starts the round');
select is(pg_temp.guest_votes('revealed', 'Ola', 'Bartek', 1), 'ok', 'cast_vote as Ola is accepted');
select is(pg_temp.guest_votes('revealed', 'Bartek', null, 1), 'ok', 'cast_vote as Bartek, an abstention, is accepted');
select is(pg_temp.urn_rows('round_voters', 'revealed'), '2', 'mid-round, private.round_voters lists the 2 voters');
select is(pg_temp.host_votes('revealed', 'Ola', 1), 'ok', 'cast_vote as the host, the last of 3, is accepted');
select is(pg_temp.round_phase('revealed', 1), 'revealed', 'the last vote revealed the round');
select is(pg_temp.urn_rows('ballot_boxes', 'revealed'), '0', 'after the reveal, no private.ballot_boxes row is left');
select is(pg_temp.urn_rows('round_voters', 'revealed'), '0', 'after the reveal, no private.round_voters row is left');

-- A round abandoned by "Nowa gra" leaves nothing ---------------------------------------------------------------------

select isnt(
  pg_temp.open_room('abandoned', array['Ola', 'Bartek']), null, 'setup: a host opens a room and 2 guests join'
);
select is(pg_temp.host_starts('abandoned'), 'ok', 'start_game as the host starts the round to abandon');
select is(pg_temp.guest_votes('abandoned', 'Ola', 'Bartek', 1), 'ok', 'cast_vote as Ola is accepted');
select is(pg_temp.urn_rows('round_voters', 'abandoned'), '1', 'before Nowa gra, private.round_voters holds the vote');
-- S-08: a latecomer waiting and one turned away when the room closes; both requests go with it.
select is(
  pg_temp.latecomers_ask('abandoned'), 'ok', 'setup: Kuba asks to join, Wiktor asks and the host turns him away'
);
select is(
  pg_temp.join_request_rows('abandoned'), 'pending 1, rejected 1',
  'before Nowa gra, public.join_requests holds a pending and a rejected request of the room'
);
select is(
  pg_temp.host_opens_new_room('abandoned'), 'ok', 'setup: Nowa gra with confirmation closes the room mid-round'
);
select is(pg_temp.urn_rows('ballot_boxes', 'abandoned'), '0', 'after Nowa gra, no private.ballot_boxes row is left');
select is(pg_temp.urn_rows('round_voters', 'abandoned'), '0', 'after Nowa gra, no private.round_voters row is left');
select is(
  pg_temp.join_request_rows('abandoned'), 'none', 'after Nowa gra, no public.join_requests row of the room is left'
);

-- The game's question list stays with its closed room (S-06) ---------------------------------------------------------

-- Karol's decision in the plan: own questions and removals stay for S-11 and for the game's creator (FR-021), so
-- closing the room keeps its list whole; it goes only with the room itself. A list holds no voter and no count.
select isnt(pg_temp.open_room('listed', array[]::text[]), null, 'setup: a host opens a room with no guests');
select is(
  pg_temp.host_reviews_list('listed'), 'ok',
  'setup: the host opens the list of 15, removes position 2 and adds an own question'
);
select is(
  pg_temp.list_rows('listed'), '16 rows, 1 removed, 1 own',
  'before Nowa gra, private.game_questions holds the room''s list: 16 rows, 1 removed, 1 own'
);
select is(pg_temp.host_opens_new_room('listed'), 'ok', 'setup: Nowa gra closes the room in the lobby');
select is(pg_temp.room_status('listed'), 'closed', 'Nowa gra closed the room with the list');
select is(
  pg_temp.list_rows('listed'), '16 rows, 1 removed, 1 own',
  'after Nowa gra, private.game_questions keeps the closed room''s list: 16 rows, 1 removed, 1 own'
);

-- A round skipped while voting keeps nothing of its votes -------------------------------------------------------

-- D3: the skipped round stays as a row in phase skipped, with no urn and no count; the next round opens with its own
-- empty urn, so only round 2's rows are counted.
select isnt(pg_temp.open_room('skipped', array['Ola', 'Bartek']), null, 'setup: a host opens a room and 2 guests join');
select is(pg_temp.host_starts('skipped'), 'ok', 'start_game as the host starts the evening with a skip');
select is(pg_temp.host_reveals('skipped', 1), 'ok', 'setup: reveal_round as the host reveals round 1');
select is(
  pg_temp.host_next('skipped', 1, array['na-co-dzien-001', 'na-co-dzien-002']), 'ok',
  'next_round as the host opens round 2'
);
select is(pg_temp.guest_votes('skipped', 'Ola', 'Bartek', 2), 'ok', 'cast_vote as Ola in round 2 is accepted');
select is(
  pg_temp.urn_rows('round_voters', 'skipped', 2), '1', 'before the skip, private.round_voters of round 2 holds the vote'
);
select is(
  pg_temp.host_skips('skipped', 2, array['na-co-dzien-001', 'na-co-dzien-002', 'na-co-dzien-003']), 'ok',
  'skip_round as the host skips round 2 while it is voting'
);
select is(pg_temp.round_phase('skipped', 2), 'skipped', 'the skipped round stays as a row in phase skipped');
select is(
  pg_temp.urn_rows('ballot_boxes', 'skipped', 2), '0', 'after the skip, no private.ballot_boxes row of round 2 is left'
);
select is(
  pg_temp.urn_rows('round_voters', 'skipped', 2), '0', 'after the skip, no private.round_voters row of round 2 is left'
);
select is(
  pg_temp.round_counts('skipped', 2), 'abstained none | ballots none | results 0',
  'the skipped round keeps no count: no abstentions, no ballots, no results'
);

-- A game ended while a round is voting keeps nothing of that round ---------------------------------------------------

-- D4: "Zakończ grę" closes the room and drops the urn of the round in progress, as "Nowa gra" does.
select isnt(pg_temp.open_room('ended', array['Ola', 'Bartek']), null, 'setup: a host opens a room and 2 guests join');
select is(pg_temp.host_starts('ended'), 'ok', 'start_game as the host starts the evening to end');
select is(pg_temp.host_reveals('ended', 1), 'ok', 'setup: reveal_round as the host reveals round 1');
select is(
  pg_temp.host_next('ended', 1, array['na-co-dzien-001', 'na-co-dzien-002']), 'ok',
  'next_round as the host opens round 2'
);
select is(pg_temp.guest_votes('ended', 'Ola', 'Bartek', 2), 'ok', 'cast_vote as Ola in round 2 is accepted');
select is(
  pg_temp.urn_rows('round_voters', 'ended', 2), '1', 'before the end, private.round_voters of round 2 holds the vote'
);
select is(
  pg_temp.latecomers_ask('ended'), 'ok', 'setup: Kuba asks to join, Wiktor asks and the host turns him away'
);
select is(
  pg_temp.join_request_rows('ended'), 'pending 1, rejected 1',
  'before the end, public.join_requests holds a pending and a rejected request of the room'
);
select is(pg_temp.host_ends('ended'), 'ok', 'end_game as the host ends the game while round 2 is voting');
select is(pg_temp.room_status('ended'), 'closed', 'end_game closes the room');
select is(
  pg_temp.urn_rows('ballot_boxes', 'ended', 2), '0', 'after the end, no private.ballot_boxes row of round 2 is left'
);
select is(
  pg_temp.urn_rows('round_voters', 'ended', 2), '0', 'after the end, no private.round_voters row of round 2 is left'
);
select is(
  pg_temp.round_counts('ended', 2), 'abstained none | ballots none | results 0',
  'the round ended without a reveal keeps no count'
);
select is(
  pg_temp.join_request_rows('ended'), 'none', 'after the end, no public.join_requests row of the room is left'
);

-- A crash mid-round loses the votes cast before it, and only those -------------------------------------------------

-- The urn is unlogged, so a crash empties it while the logged round stays in voting. The votes cast before the crash
-- are lost and their voters may vote again (D1, plan Migration Notes); every vote after it must count. Oracle written
-- out from the votes after the crash: Ola for Bartek, Bartek abstains, the host for Ola.
select isnt(
  pg_temp.open_room('crashed', array['Ola', 'Bartek']), null, 'setup: a host opens a room and 2 guests join'
);
select is(pg_temp.host_starts('crashed'), 'ok', 'start_game as the host starts the round to crash');
select is(pg_temp.guest_votes('crashed', 'Ola', 'Ola', 1), 'ok', 'cast_vote as Ola before the crash is accepted');
select is(pg_temp.crash_urn('crashed'), 'emptied', 'setup: a crash empties the urn of the round in progress');
select is(
  pg_temp.guest_votes('crashed', 'Ola', 'Bartek', 1), 'ok', 'after the crash, Ola, whose vote it lost, votes again'
);
select is(pg_temp.guest_votes('crashed', 'Bartek', null, 1), 'ok', 'after the crash, Bartek abstains');
select is(pg_temp.host_votes('crashed', 'Ola', 1), 'ok', 'after the crash, the host votes, the last of 3');
select is(pg_temp.round_phase('crashed', 1), 'revealed', 'the last vote after the crash revealed the round');
select is(
  pg_temp.results_of('crashed', 1),
  'Bartek 1, Host 0, Ola 1 | abstained 1 | ballots 3',
  'the reveal after a crash counts every vote cast after it'
);

-- The hourly sweep closes games started over 12 hours ago, and only those -------------------------------------------

-- Called directly: the schedule is checked by its row in cron.job, not by waiting for it.
select isnt(pg_temp.open_room('stale', array['Ola', 'Bartek']), null, 'setup: a host opens a room and 2 guests join');
select is(pg_temp.host_starts('stale'), 'ok', 'start_game as the host starts the stale game');
select is(pg_temp.guest_votes('stale', 'Ola', 'Bartek', 1), 'ok', 'cast_vote as Ola in the stale game is accepted');
select is(
  pg_temp.latecomers_ask('stale'), 'ok', 'setup: Kuba asks to join the stale game, Wiktor asks and is turned away'
);
select lives_ok(
  format(
    'update public.rooms set started_at = now() - interval %L where id = %L', '13 hours', pg_temp.room_of('stale')
  ),
  'setup: the stale game started 13 hours ago (rooms.started_at)'
);

select isnt(pg_temp.open_room('fresh', array['Ola', 'Bartek']), null, 'setup: a host opens a room and 2 guests join');
select is(pg_temp.host_starts('fresh'), 'ok', 'start_game as the host starts a game now');
select is(pg_temp.guest_votes('fresh', 'Ola', 'Bartek', 1), 'ok', 'cast_vote as Ola in the fresh game is accepted');

-- The clock runs from the start of the game, not from the room: an old lobby is not a stale game.
select isnt(pg_temp.open_room('old-lobby', array[]::text[]), null, 'setup: a host opens a room with no guests');
update public.rooms set created_at = now() - interval '13 hours' where id = pg_temp.room_of('old-lobby');

-- S-03: an evening abandoned in its second round, whose urn only a sweep that reads every round of the room drops.
select isnt(
  pg_temp.open_room('stale-round-2', array['Ola', 'Bartek']), null, 'setup: a host opens a room and 2 guests join'
);
select is(pg_temp.host_starts('stale-round-2'), 'ok', 'start_game as the host starts the stale evening');
select is(pg_temp.host_reveals('stale-round-2', 1), 'ok', 'setup: reveal_round as the host reveals round 1');
select is(
  pg_temp.host_next('stale-round-2', 1, array['na-co-dzien-001', 'na-co-dzien-002']), 'ok',
  'next_round as the host opens round 2 of the stale evening'
);
select is(
  pg_temp.guest_votes('stale-round-2', 'Ola', 'Bartek', 2), 'ok',
  'cast_vote as Ola in round 2 of the stale evening is accepted'
);
select lives_ok(
  format(
    'update public.rooms set started_at = now() - interval %L where id = %L',
    '13 hours', pg_temp.room_of('stale-round-2')
  ),
  'setup: the stale evening started 13 hours ago (rooms.started_at)'
);

select is(pg_temp.urn_rows('round_voters', 'stale'), '1', 'before the sweep, the stale game holds its vote');
select is(
  pg_temp.urn_rows('round_voters', 'stale-round-2', 2), '1',
  'before the sweep, round 2 of the stale evening holds its vote'
);
select is(
  pg_temp.join_request_rows('stale'), 'pending 1, rejected 1',
  'before the sweep, public.join_requests holds a pending and a rejected request of the stale game'
);
select lives_ok('select private.close_stale_games()', 'private.close_stale_games() runs as the owner');

select is(pg_temp.room_status('stale'), 'closed', 'the sweep closes a game started 13 hours ago');
select is(pg_temp.urn_rows('ballot_boxes', 'stale'), '0', 'the sweep leaves no private.ballot_boxes row of it');
select is(pg_temp.urn_rows('round_voters', 'stale'), '0', 'the sweep leaves no private.round_voters row of it');
select is(pg_temp.join_request_rows('stale'), 'none', 'the sweep leaves no public.join_requests row of it');
select is(
  pg_temp.urn_rows('ballot_boxes', 'stale-round-2', 2), '0',
  'the sweep leaves no private.ballot_boxes row of the stale evening''s round 2'
);
select is(
  pg_temp.urn_rows('round_voters', 'stale-round-2', 2), '0',
  'the sweep leaves no private.round_voters row of the stale evening''s round 2'
);

select is(pg_temp.room_status('fresh'), 'playing', 'the sweep leaves a game started now in play');
select is(pg_temp.urn_rows('ballot_boxes', 'fresh'), '1', 'the sweep leaves the urn of a game started now');
select is(pg_temp.urn_rows('round_voters', 'fresh'), '1', 'the sweep leaves the voters of a game started now');

-- Needs the sweep itself: without it, an untouched lobby would prove nothing.
select ok(
  to_regprocedure('private.close_stale_games()') is not null and pg_temp.room_status('old-lobby') = 'lobby',
  'the sweep leaves alone a lobby created 13 hours ago'
);

select is(
  pg_temp.cron_job('close-stale-games'),
  '0 * * * * | select private.close_stale_games()',
  'cron.job runs select private.close_stale_games() every hour as close-stale-games'
);

-- S-11: a reveal with thumbs, folded by "Następne pytanie" --------------------------------------------------------

-- Five players, four ballots and the host's reveal. Oracle written out from the votes: Ola for Bartek, Bartek for
-- Bartek, Ewa for Ola, Kasia abstains, the host does not vote; so 5 eligible, 4 ballots, 1 abstention, 3 votes for
-- persons (at least 2: a scored reveal) and 2 for the most voted one (Bartek). Thumbs: the host up, Ola down, Bartek up
-- and then none, so 1 up and 1 down reach the counters at the fold, and none before it.
select isnt(
  pg_temp.open_room('thumbs', array['Ola', 'Bartek', 'Ewa', 'Kasia']), null,
  'setup: a host opens a room and 4 guests join'
);
select is(
  pg_temp.snapshot_stats('pgtap-thumbs-001', 'pgtap-thumbs-002'), 'ok',
  'setup: the counters of the game''s two questions before the game'
);
select is(
  pg_temp.host_starts_with('thumbs', 'pgtap-thumbs-001'), 'ok', 'start_game as the host starts round 1 with thumbs'
);
select is(pg_temp.guest_votes('thumbs', 'Ola', 'Bartek', 1), 'ok', 'cast_vote as Ola is accepted');
select is(pg_temp.guest_votes('thumbs', 'Bartek', 'Bartek', 1), 'ok', 'cast_vote as Bartek, for himself, is accepted');
select is(pg_temp.guest_votes('thumbs', 'Ewa', 'Ola', 1), 'ok', 'cast_vote as Ewa is accepted');
select is(pg_temp.guest_votes('thumbs', 'Kasia', null, 1), 'ok', 'cast_vote as Kasia, an abstention, is accepted');
select is(pg_temp.host_reveals('thumbs', 1), 'ok', 'reveal_round as the host reveals round 1 with 4 of 5 ballots');
select is(
  pg_temp.stats_gain('pgtap-thumbs-001'),
  'pgtap-thumbs-001: revealed +1, eligible +5, ballots +4, abstained +1, scored +1, scored_eligible +5, '
    || 'scored_votes +3, scored_top +2',
  'the reveal adds its numbers to the question''s counters: 5 eligible, 4 ballots, 1 abstention, scored with 3 and 2'
);
select is(pg_temp.host_reacts('thumbs', 'up', 1), 'ok', 'react_round as the host, up, is accepted');
select is(pg_temp.guest_reacts('thumbs', 'Ola', 'down', 1), 'ok', 'react_round as Ola, down, is accepted');
select is(pg_temp.guest_reacts('thumbs', 'Bartek', 'up', 1), 'ok', 'react_round as Bartek, up, is accepted');
select is(pg_temp.guest_reacts('thumbs', 'Bartek', 'none', 1), 'ok', 'react_round as Bartek, none, takes his back');
select is(
  pg_temp.urn_rows('round_reactions', 'thumbs', 1), '2',
  'before Następne pytanie, private.round_reactions of round 1 holds 2 thumbs'
);
-- A thumb is never counted in the player's own transaction: its id would sit next to the question.
select is(
  pg_temp.stats_gain('pgtap-thumbs-001'),
  'pgtap-thumbs-001: revealed +1, eligible +5, ballots +4, abstained +1, scored +1, scored_eligible +5, '
    || 'scored_votes +3, scored_top +2',
  'before the fold the thumbs add nothing to the counters'
);
select is(
  pg_temp.host_next('thumbs', 1, array['pgtap-thumbs-001', 'pgtap-thumbs-002']), 'ok',
  'next_round as the host opens round 2'
);
select is(
  pg_temp.urn_rows('round_reactions', 'thumbs', 1), '0',
  'after Następne pytanie, no private.round_reactions row of round 1 is left'
);
select is(
  pg_temp.stats_gain('pgtap-thumbs-001'),
  'pgtap-thumbs-001: revealed +1, eligible +5, ballots +4, abstained +1, scored +1, scored_eligible +5, '
    || 'scored_votes +3, scored_top +2, thumbs_up +1, thumbs_down +1',
  'Następne pytanie folds round 1''s thumbs: 1 up (the host), 1 down (Ola), none from Bartek, who took his back'
);

-- One vote for a person says nothing about how the votes gather: the reveal counts, the scored counters do not.
select is(pg_temp.guest_votes('thumbs', 'Ola', 'Bartek', 2), 'ok', 'cast_vote as Ola in round 2 is accepted');
select is(pg_temp.host_reveals('thumbs', 2), 'ok', 'reveal_round as the host reveals round 2 with 1 ballot');
select is(
  pg_temp.stats_gain('pgtap-thumbs-002'),
  'pgtap-thumbs-002: revealed +1, eligible +5, ballots +1',
  'a reveal with 1 vote for a person adds the reveal, its 5 eligible and 1 ballot, and nothing to the scored counters'
);

-- "Zakończ grę" on a reveal folds its thumbs too.
select is(
  pg_temp.snapshot_stats('pgtap-thumbs-002'), 'ok', 'setup: the counters of question 2 after its reveal'
);
select is(pg_temp.guest_reacts('thumbs', 'Ewa', 'down', 2), 'ok', 'react_round as Ewa on round 2, down, is accepted');
select is(pg_temp.host_ends('thumbs'), 'ok', 'end_game as the host ends the game on the reveal of round 2');
select is(
  pg_temp.urn_rows('round_reactions', 'thumbs'), '0',
  'after the end, no private.round_reactions row of the room is left'
);
select is(
  pg_temp.stats_gain('pgtap-thumbs-002'), 'pgtap-thumbs-002: thumbs_down +1', 'Zakończ grę folds the thumb of round 2'
);

-- S-11: "Nowa gra" and the sweep fold the thumbs of a reveal --------------------------------------------------------

select isnt(
  pg_temp.open_room('thumbs-new', array['Ola', 'Bartek']), null, 'setup: a host opens a room and 2 guests join'
);
select is(
  pg_temp.host_starts_with('thumbs-new', 'pgtap-new-001'), 'ok', 'start_game as the host starts the round to leave'
);
select is(pg_temp.host_reveals('thumbs-new', 1), 'ok', 'setup: reveal_round as the host reveals round 1');
select is(pg_temp.snapshot_stats('pgtap-new-001'), 'ok', 'setup: the counters of the question after its reveal');
select is(pg_temp.guest_reacts('thumbs-new', 'Ola', 'up', 1), 'ok', 'react_round as Ola, up, is accepted');
select is(
  pg_temp.host_opens_new_room('thumbs-new'), 'ok', 'setup: Nowa gra with confirmation closes the room on the reveal'
);
select is(
  pg_temp.urn_rows('round_reactions', 'thumbs-new'), '0',
  'after Nowa gra, no private.round_reactions row of the room is left'
);
select is(pg_temp.stats_gain('pgtap-new-001'), 'pgtap-new-001: thumbs_up +1', 'Nowa gra folds the thumb');

select isnt(
  pg_temp.open_room('thumbs-stale', array['Ola', 'Bartek']), null, 'setup: a host opens a room and 2 guests join'
);
select is(
  pg_temp.host_starts_with('thumbs-stale', 'pgtap-stale-001'), 'ok',
  'start_game as the host starts the round to abandon'
);
select is(pg_temp.host_reveals('thumbs-stale', 1), 'ok', 'setup: reveal_round as the host reveals round 1');
select is(pg_temp.guest_reacts('thumbs-stale', 'Bartek', 'down', 1), 'ok', 'react_round as Bartek, down, is accepted');
select lives_ok(
  format(
    'update public.rooms set started_at = now() - interval %L where id = %L',
    '13 hours', pg_temp.room_of('thumbs-stale')
  ),
  'setup: the game abandoned on its reveal started 13 hours ago (rooms.started_at)'
);
select is(pg_temp.snapshot_stats('pgtap-stale-001'), 'ok', 'setup: the counters of the question before the sweep');
select lives_ok('select private.close_stale_games()', 'private.close_stale_games() runs as the owner again');
select is(
  pg_temp.urn_rows('round_reactions', 'thumbs-stale'), '0',
  'the sweep leaves no private.round_reactions row of the game abandoned on its reveal'
);
select is(pg_temp.stats_gain('pgtap-stale-001'), 'pgtap-stale-001: thumbs_down +1', 'the sweep folds the thumb');

-- S-11: after no_questions the thumbs wait for the end, and count once ---------------------------------------------

-- "Następne pytanie" that opens no round folds nothing: Ola's thumb stays, she turns it down, and only the down counts
-- at the end.
select isnt(
  pg_temp.open_room('thumbs-last', array['Ola', 'Bartek']), null, 'setup: a host opens a room and 2 guests join'
);
select is(
  pg_temp.host_starts_with('thumbs-last', 'pgtap-last-001'), 'ok', 'start_game as the host starts the only question'
);
select is(pg_temp.host_reveals('thumbs-last', 1), 'ok', 'setup: reveal_round as the host reveals round 1');
select is(pg_temp.snapshot_stats('pgtap-last-001'), 'ok', 'setup: the counters of the question after its reveal');
select is(pg_temp.guest_reacts('thumbs-last', 'Ola', 'up', 1), 'ok', 'react_round as Ola, up, is accepted');
select is(
  pg_temp.host_next('thumbs-last', 1, array['pgtap-last-001']), '{"ok": false, "reason": "no_questions"}',
  'next_round with every candidate played answers no_questions'
);
select is(
  pg_temp.urn_rows('round_reactions', 'thumbs-last', 1), '1',
  'after no_questions, Ola''s thumb waits in private.round_reactions'
);
select is(
  pg_temp.stats_gain('pgtap-last-001'), 'pgtap-last-001: no change', 'next_round with no_questions folds nothing'
);
select is(
  pg_temp.guest_reacts('thumbs-last', 'Ola', 'down', 1), 'ok',
  'react_round as Ola after no_questions, down, is accepted'
);
select is(pg_temp.host_ends('thumbs-last'), 'ok', 'end_game as the host ends the game');
select is(
  pg_temp.urn_rows('round_reactions', 'thumbs-last'), '0',
  'after the end, no private.round_reactions row of the room is left'
);
select is(
  pg_temp.stats_gain('pgtap-last-001'), 'pgtap-last-001: thumbs_down +1',
  'the end folds Ola''s thumb once, as it stood: 1 down and no up'
);

-- S-11: a skip counts itself and nothing of its urn -----------------------------------------------------------------

select isnt(
  pg_temp.open_room('stats-skip', array['Ola', 'Bartek']), null, 'setup: a host opens a room and 2 guests join'
);
select is(pg_temp.snapshot_stats('pgtap-skip-001'), 'ok', 'setup: the counters of the question before the game');
select is(
  pg_temp.host_starts_with('stats-skip', 'pgtap-skip-001'), 'ok', 'start_game as the host starts the round to skip'
);
select is(pg_temp.guest_votes('stats-skip', 'Ola', 'Bartek', 1), 'ok', 'cast_vote as Ola is accepted');
select is(
  pg_temp.host_skips('stats-skip', 1, array['pgtap-skip-002']), 'ok',
  'skip_round as the host skips round 1 while it is voting'
);
select is(
  pg_temp.stats_gain('pgtap-skip-001'), 'pgtap-skip-001: skipped +1',
  'the skip adds only skipped: no reveal, no ballot of its urn (D3)'
);

-- S-11: the start counts the list; an own or reworded question counts nothing -----------------------------------------

-- The list: position 1 reworded, 2 removed, 3 reworded and then removed, 4 and 5 as in the base, 6 the host's own. Only
-- entries of the base with no text of their own count: 2 (listed and removed), 4 and 5 (listed). Round 1 is position
-- 1, reworded, so it has no question id: its reveal and its thumb count nowhere, not even under position 1's id.
select isnt(
  pg_temp.open_room('stats-list', array['Ola', 'Bartek']), null, 'setup: a host opens a room and 2 guests join'
);
select is(
  pg_temp.host_prepares_list(
    'stats-list',
    array['pgtap-list-001', 'pgtap-list-002', 'pgtap-list-003', 'pgtap-list-004', 'pgtap-list-005'],
    array[1, 3], array[2, 3], true
  ),
  'ok',
  'setup: the host lists 5 questions, rewords 1, removes 2, rewords and removes 3, and adds an own question'
);
select is(
  pg_temp.snapshot_stats('pgtap-list-001', 'pgtap-list-002', 'pgtap-list-003', 'pgtap-list-004', 'pgtap-list-005'),
  'ok',
  'setup: the counters of the listed questions before the start'
);
select is(pg_temp.host_starts('stats-list'), 'ok', 'start_game as the host starts the game with the list');
select is(
  pg_temp.stats_gain('pgtap-list-001', 'pgtap-list-002', 'pgtap-list-003', 'pgtap-list-004', 'pgtap-list-005'),
  'pgtap-list-001: no change; pgtap-list-002: listed +1, removed +1; pgtap-list-003: no change; '
    || 'pgtap-list-004: listed +1; pgtap-list-005: listed +1',
  'start_game counts only the entries of the base with no text of their own: listed, and removed for the removed one'
);
select is(pg_temp.host_reveals('stats-list', 1), 'ok', 'reveal_round as the host reveals the reworded round 1');
select is(pg_temp.host_reacts('stats-list', 'up', 1), 'ok', 'react_round as the host on the reworded round, up');
select is(
  pg_temp.urn_rows('round_reactions', 'stats-list', 1), '1',
  'before Następne pytanie, private.round_reactions holds the thumb on the reworded round'
);
select is(
  pg_temp.host_next('stats-list', 1, array[]::text[]), 'ok', 'next_round as the host opens round 2 from the list'
);
select is(
  pg_temp.urn_rows('round_reactions', 'stats-list', 1), '0',
  'after Następne pytanie, the thumb on the reworded round is deleted'
);
select is(
  pg_temp.stats_gain('pgtap-list-001', 'pgtap-list-002', 'pgtap-list-003', 'pgtap-list-004', 'pgtap-list-005'),
  'pgtap-list-001: no change; pgtap-list-002: listed +1, removed +1; pgtap-list-003: no change; '
    || 'pgtap-list-004: listed +1; pgtap-list-005: listed +1',
  'the reworded round''s reveal and thumb add nothing to any counter'
);

-- A list of a room closed in the lobby counts nothing, its removal included: the list is final only at the start.
select isnt(pg_temp.open_room('stats-lobby', array[]::text[]), null, 'setup: a host opens a room with no guests');
select is(
  pg_temp.snapshot_stats('pgtap-lobby-001', 'pgtap-lobby-002'), 'ok',
  'setup: the counters of the questions before the list'
);
select is(
  pg_temp.host_prepares_list(
    'stats-lobby', array['pgtap-lobby-001', 'pgtap-lobby-002'], array[]::integer[], array[2], false
  ),
  'ok',
  'setup: the host lists 2 questions and removes the second'
);
select is(pg_temp.host_opens_new_room('stats-lobby'), 'ok', 'setup: Nowa gra closes the room in the lobby');
select is(
  pg_temp.stats_gain('pgtap-lobby-001', 'pgtap-lobby-002'),
  'pgtap-lobby-001: no change; pgtap-lobby-002: no change',
  'a room closed in the lobby counts nothing of its list, its removal included'
);

-- S-11: an excluded host's game counts nothing, and its thumbs still go ---------------------------------------------

-- The row the migration adds for the smoke account names an account the throwaway database does not have, so the test
-- adds this room's host itself. Everything that counts elsewhere happens here: a list with a removal, a reveal with a
-- thumb, a skip, a second reveal with a thumb, the end.
select isnt(
  pg_temp.open_room('stats-excluded', array['Ola', 'Bartek']), null, 'setup: a host opens a room and 2 guests join'
);
select lives_ok(
  format(
    'insert into private.stats_excluded_hosts (user_id) values (%L)', pg_temp.host_of('stats-excluded')
  ),
  'setup: the room''s host is in private.stats_excluded_hosts, as the smoke account is'
);
select is(
  pg_temp.snapshot_stats('pgtap-excluded-001', 'pgtap-excluded-002', 'pgtap-excluded-003', 'pgtap-excluded-004'),
  'ok',
  'setup: the counters of the excluded host''s questions before the game'
);
select is(
  pg_temp.host_prepares_list(
    'stats-excluded', array['pgtap-excluded-001', 'pgtap-excluded-002'], array[]::integer[], array[2], false
  ),
  'ok',
  'setup: the excluded host lists 2 questions and removes the second'
);
select is(pg_temp.host_starts('stats-excluded'), 'ok', 'start_game as the excluded host starts the game');
select is(pg_temp.host_reveals('stats-excluded', 1), 'ok', 'reveal_round as the excluded host reveals round 1');
select is(pg_temp.host_reacts('stats-excluded', 'up', 1), 'ok', 'react_round as the excluded host, up, is accepted');
select is(
  pg_temp.host_next('stats-excluded', 1, array['pgtap-excluded-003']), 'ok',
  'next_round as the excluded host opens round 2'
);
select is(
  pg_temp.host_skips('stats-excluded', 2, array['pgtap-excluded-004']), 'ok',
  'skip_round as the excluded host skips round 2 and opens round 3'
);
select is(pg_temp.host_reveals('stats-excluded', 3), 'ok', 'reveal_round as the excluded host reveals round 3');
select is(
  pg_temp.guest_reacts('stats-excluded', 'Ola', 'down', 3), 'ok', 'react_round as Ola on round 3, down, is accepted'
);
select is(pg_temp.host_ends('stats-excluded'), 'ok', 'end_game as the excluded host ends the game');
select is(
  pg_temp.urn_rows('round_reactions', 'stats-excluded'), '0',
  'after the end, no private.round_reactions row of the excluded host''s room is left'
);
select is(
  pg_temp.stats_gain('pgtap-excluded-001', 'pgtap-excluded-002', 'pgtap-excluded-003', 'pgtap-excluded-004'),
  'pgtap-excluded-001: no change; pgtap-excluded-002: no change; pgtap-excluded-003: no change; '
    || 'pgtap-excluded-004: no change',
  'the excluded host''s game adds nothing: no list, no reveal, no skip, no thumb'
);

select * from finish();

rollback;
