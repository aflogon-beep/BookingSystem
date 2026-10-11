-- Llegadas por persona y «No vino» (como FareHarbor): el check-in ya no es solo «todo el grupo».
--
--   checked_in = true,  arrived_pax = null → ha llegado todo el grupo (como hasta ahora)
--   checked_in = true,  arrived_pax = n    → han llegado n de las personas de la reserva
--   checked_in = false, no_show = true     → no se ha presentado nadie
--   checked_in = false, no_show = false    → aún no ha llegado
--
-- Solo se cambian con booking_set_arrival (o las funciones de check-in de siempre), que dejan
-- historial. Al mover o cancelar una reserva vuelve a «aún no ha llegado».

alter table public.bookings
  add column arrived_pax integer check (arrived_pax is null or arrived_pax >= 1),
  add column no_show boolean not null default false,
  add constraint bookings_arrival_consistent check (
    (checked_in or arrived_pax is null) and not (checked_in and no_show)
  );

-- Coherencia cuando otras funciones tocan checked_in, la salida o el estado de la reserva.
create function public.bookings_reset_arrival()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.session_id is distinct from old.session_id or new.status <> 'confirmed' then
    new.checked_in := false;
    new.arrived_pax := null;
    new.no_show := false;
  elsif new.checked_in then
    new.no_show := false;
  else
    new.arrived_pax := null;
  end if;
  return new;
end;
$$;

create trigger bookings_reset_arrival
before update of session_id, status, checked_in, arrived_pax, no_show on public.bookings
for each row execute function public.bookings_reset_arrival();

-- Marca la llegada de una reserva confirmada:
--   p_arrived = null (o sin pasarlo) → aún no ha llegado (deshace)
--   p_arrived = 0    → no se ha presentado
--   p_arrived = 1..pax → han llegado esas personas (pax = todo el grupo)
-- Devuelve las personas que han llegado (0 si ninguna).
create function public.booking_set_arrival(p_booking_id uuid, p_arrived integer default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_pax integer;
  v_checked boolean;
  v_partial integer;
  v_no_show boolean;
  v_text text;
begin
  if not public.is_staff() then
    raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Reserva no encontrada' using errcode = 'no_data_found';
  end if;
  if v_booking.status <> 'confirmed' then
    raise exception 'Solo las reservas confirmadas hacen check-in' using errcode = 'RB004';
  end if;

  select coalesce(sum(qty), 0)::integer into v_pax from public.booking_lines where booking_id = p_booking_id;
  if p_arrived is not null and (p_arrived < 0 or p_arrived > v_pax) then
    raise exception 'Número de personas no válido' using errcode = 'invalid_parameter_value';
  end if;

  v_checked := coalesce(p_arrived, 0) > 0;
  v_partial := case when v_checked and p_arrived < v_pax then p_arrived end;
  v_no_show := p_arrived = 0;

  if v_booking.checked_in = v_checked
     and v_booking.arrived_pax is not distinct from v_partial
     and v_booking.no_show = coalesce(v_no_show, false) then
    return coalesce(p_arrived, 0);
  end if;

  update public.bookings
  set checked_in = v_checked, arrived_pax = v_partial, no_show = coalesce(v_no_show, false)
  where id = p_booking_id;

  v_text := case
    when p_arrived is null then 'Check-in deshecho'
    when p_arrived = 0 then 'No se ha presentado'
    when v_partial is not null then format('Check-in: llegan %s de %s', p_arrived, v_pax)
    else 'Check-in realizado'
  end;
  insert into public.booking_events (booking_id, actor, text)
  values (p_booking_id, public.staff_actor(), v_text);
  return coalesce(p_arrived, 0);
end;
$$;

revoke all on function public.booking_set_arrival(uuid, integer) from public, anon;
grant execute on function public.booking_set_arrival(uuid, integer) to authenticated;

-- «Marcar todos» no marca como llegados a los que ya se han dado por no presentados.
create or replace function public.session_check_in_all(p_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.is_staff() then
    raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
  end if;
  -- Misma cola que session_set_status y create_booking_hold: sin bloqueos cruzados.
  perform 1 from public.sessions where id = p_session_id for update;
  if not found then
    raise exception 'Salida no encontrada' using errcode = 'no_data_found';
  end if;

  with marked as (
    update public.bookings
    set checked_in = true
    where session_id = p_session_id and status = 'confirmed' and not checked_in and not no_show
    returning id
  )
  insert into public.booking_events (booking_id, actor, text)
  select id, public.staff_actor(), 'Check-in realizado' from marked;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.bookings_reset_arrival() from public, anon, authenticated;
