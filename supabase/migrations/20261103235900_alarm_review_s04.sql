-- Próbny alarm przeglądu S-04 (do cofnięcia, nigdy na produkcję): request_return nie kasuje śladu moved, a request_join
-- zostawia player_id odrzuconej prośby o powrót.

create or replace function public.request_join(p_link_token text, p_nick text, p_player_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room uuid;
  v_status text;
  v_hash bytea;
  v_nick text;
  v_request uuid;
  v_request_status text;
begin
  -- The server sends the cookie's 32-byte token or a fresh one; anything else is not our client.
  if p_player_token is null or p_player_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'invalid player token' using errcode = '22023';
  end if;

  if p_link_token is null or p_link_token !~ '^[A-Za-z0-9_-]{22}$' then
    return jsonb_build_object('ok', false, 'reason', 'room_unknown');
  end if;

  -- The row lock makes requests to one room take turns (the limit, the nicks) and orders them against a leader letting
  -- someone in, a round opening and the room closing.
  select r.id, r.status into v_room, v_status
  from public.rooms r
  where r.link_token = p_link_token
  for update;

  if v_room is null then
    return jsonb_build_object('ok', false, 'reason', 'room_unknown');
  end if;

  -- Before the start anyone joins through join_room, without the host.
  if v_status = 'lobby' then
    return jsonb_build_object('ok', false, 'reason', 'room_open');
  end if;

  if v_status <> 'playing' then
    return jsonb_build_object('ok', false, 'reason', 'room_closed');
  end if;

  v_hash := sha256(convert_to(p_player_token, 'UTF8'));

  -- Let in already: the screen moves on to the room.
  if exists (
    select 1
    from public.player_secrets s
    join public.players p on p.id = s.player_id
    where s.token_hash = v_hash and p.room_id = v_room
  ) then
    return jsonb_build_object('ok', true);
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

  select q.id, q.status into v_request, v_request_status
  from public.join_requests q
  where q.token_hash = v_hash and q.room_id = v_room;

  -- Waiting already, under the nick it asked with (to join, or to come back): the form sent twice changes nothing.
  if v_request_status = 'pending' then
    return jsonb_build_object('ok', true);
  end if;

  -- What looks the same is the same nick, among the players and the requests waiting (this token's own request is not
  -- waiting by now, and a trace never waits).
  if exists (
    select 1 from public.players p where p.room_id = v_room and p.nick_key = private.nick_key(v_nick)
  ) or exists (
    select 1 from public.join_requests q
    where q.room_id = v_room and q.status = 'pending' and q.nick_key = private.nick_key(v_nick)
  ) then
    return jsonb_build_object('ok', false, 'reason', 'nick_taken');
  end if;

  -- At most 5 wait at once, so the leader's list never covers the game.
  if (
    select count(*) from public.join_requests q where q.room_id = v_room and q.status = 'pending'
  ) >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'requests_full');
  end if;

  if v_request_status = 'rejected' then
    -- Turned away before: the same request asks again, under the nick sent now, as a request to join (no place, even
    -- if it asked to come back before), and takes its place at the end of the leader's list, as a request made now.
    update public.join_requests
    set nick = v_nick, status = 'pending', created_at = now()
    where id = v_request;
  else
    -- A trace of a place that moved to another token gives way to a new request.
    if v_request is not null then
      delete from public.join_requests where id = v_request;
    end if;

    insert into public.join_requests (room_id, nick, token_hash)
    values (v_room, v_nick, v_hash);
  end if;

  return jsonb_build_object('ok', true);
end;
$$;


create or replace function public.request_return(p_link_token text, p_nick text, p_player_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room uuid;
  v_status text;
  v_hash bytea;
  v_place uuid;
  v_place_nick text;
  v_place_host boolean;
  v_request uuid;
  v_request_status text;
begin
  -- The server sends the cookie's 32-byte token or a fresh one; anything else is not our client.
  if p_player_token is null or p_player_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'invalid player token' using errcode = '22023';
  end if;

  if p_link_token is null or p_link_token !~ '^[A-Za-z0-9_-]{22}$' then
    return jsonb_build_object('ok', false, 'reason', 'room_unknown');
  end if;

  -- The room's row first, as in request_join: the limit, the nicks and a leader's answer take turns.
  select r.id, r.status into v_room, v_status
  from public.rooms r
  where r.link_token = p_link_token
  for update;

  if v_room is null then
    return jsonb_build_object('ok', false, 'reason', 'room_unknown');
  end if;

  if v_status not in ('lobby', 'playing') then
    return jsonb_build_object('ok', false, 'reason', 'room_closed');
  end if;

  v_hash := sha256(convert_to(p_player_token, 'UTF8'));

  -- A player of the room already: the screen moves on to the room. A player's token never asks for another place.
  if exists (
    select 1
    from public.player_secrets s
    join public.players p on p.id = s.player_id
    where s.token_hash = v_hash and p.room_id = v_room
  ) then
    return jsonb_build_object('ok', true);
  end if;

  -- The place: a player of the room with that nick, as compared. A nick over the nick rule's cap is no player's, and its
  -- regular expressions never run on it.
  if char_length(p_nick) <= 100 then
    select p.id, p.nick, p.user_id is not null into v_place, v_place_nick, v_place_host
    from public.players p
    where p.room_id = v_room and p.nick_key = private.nick_key(p_nick);
  end if;

  if v_place is null then
    return jsonb_build_object('ok', false, 'reason', 'player_unknown');
  end if;

  if v_place_host then
    return jsonb_build_object('ok', false, 'reason', 'host_returns_by_login');
  end if;

  select q.id, q.status into v_request, v_request_status
  from public.join_requests q
  where q.token_hash = v_hash and q.room_id = v_room;

  -- Waiting already (to come back, or to join): the form sent twice changes nothing.
  if v_request_status = 'pending' then
    return jsonb_build_object('ok', true);
  end if;

  -- Someone else waits for this nick already: only a request to come back can, since a latecomer never asks with a
  -- player's nick.
  if exists (
    select 1 from public.join_requests q
    where q.room_id = v_room and q.status = 'pending' and q.nick_key = private.nick_key(v_place_nick)
  ) then
    return jsonb_build_object('ok', false, 'reason', 'nick_taken');
  end if;

  -- The latecomers' limit: requests to come back wait on the same list.
  if (
    select count(*) from public.join_requests q where q.room_id = v_room and q.status = 'pending'
  ) >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'requests_full');
  end if;

  if v_request_status = 'rejected' then
    -- Turned away before: the same request asks again, now for this place, at the end of the leader's list.
    update public.join_requests
    set nick = v_place_nick, status = 'pending', player_id = v_place, created_at = now()
    where id = v_request;
  else
    -- A trace of a place that moved to another token gives way to a new request.
    insert into public.join_requests (room_id, nick, token_hash, player_id)
    values (v_room, v_place_nick, v_hash, v_place);
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

