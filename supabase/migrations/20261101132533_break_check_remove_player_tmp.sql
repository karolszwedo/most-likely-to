-- TYMCZASOWA migracja próbnego alarmu 1.4 (context/changes/remove-player-new-link/plan.md, Faza 1; test-plan §6.2
-- „Break-check”). Nigdy nie wgrywana do bazy (`npx supabase db push`), cofana `git revert`. Dwa uszkodzenia
-- remove_player, ta sama sygnatura, security definer i set search_path = '' zachowane:
--   (a) usunięty, który nie głosował, zostaje w eligible (bez array_remove i bez progu odsłony);
--   (b) remove_player nie wymienia rooms.link_token.
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
begin
  select r.host_id, r.status into v_host, v_status
  from public.rooms r
  where r.id = p_room_id
  for update;

  v_refusal := private.leader_refusal(p_room_id, v_host, p_player_token);
  if v_refusal is not null then
    return jsonb_build_object('ok', false, 'reason', v_refusal);
  end if;

  if v_status = 'closed' then
    return jsonb_build_object('ok', false, 'reason', 'room_closed');
  end if;

  if char_length(p_nick) <= 100 then
    select p.id, p.cohost into v_player, v_player_cohost
    from public.players p
    where p.room_id = p_room_id and p.user_id is null and p.nick_key = private.nick_key(p_nick);
  end if;

  if v_player is null then
    return jsonb_build_object('ok', false, 'reason', 'player_unknown');
  end if;

  if v_player_cohost and v_user is distinct from v_host then
    return jsonb_build_object('ok', false, 'reason', 'cohost_protected');
  end if;

  -- (a) USZKODZONE: brak zdjęcia niegłosującego z eligible i brak progu odsłony.

  delete from private.round_reactions t
  using private.rounds r
  where r.id = t.round_id and r.room_id = p_room_id and t.player_id = v_player;

  delete from public.players where id = v_player;

  -- (b) USZKODZONE: brak nowego rooms.link_token.

  return jsonb_build_object('ok', true);
end;
$$;
