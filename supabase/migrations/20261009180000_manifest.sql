-- Manifiesto (tarea 1.9): check-in, cobro en destino y estado de la salida. Son funciones porque
-- el equipo no puede cambiar a mano el pago ni el estado de una reserva (ni escribir el
-- historial): cada una comprueba permisos, cambia lo justo y deja constancia en booking_events.

-- Nombre del miembro del equipo que llama, para el historial.
create function public.staff_actor()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select name from public.staff where user_id = auth.uid()), 'Equipo');
$$;

revoke all on function public.staff_actor() from public, anon, authenticated;

-- «138,00 €» para el historial (igual que formatCents en lib/domain/money.ts, sin miles).
create function public.format_cents(p_cents integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(to_char(p_cents / 100.0, 'FM999999990.00'), '.', ',') || ' €';
$$;

revoke all on function public.format_cents(integer) from public, anon, authenticated;

-- Check-in ---------------------------------------------------------------------------------------

-- Marca o desmarca la llegada de una reserva confirmada. Devuelve el nuevo valor.
create function public.booking_set_checked_in(p_booking_id uuid, p_checked boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
begin
  if not public.is_staff() then
    raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
  end if;
  if p_checked is null then
    raise exception 'Valor no válido' using errcode = 'invalid_parameter_value';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Reserva no encontrada' using errcode = 'no_data_found';
  end if;
  if v_booking.status <> 'confirmed' then
    raise exception 'Solo las reservas confirmadas hacen check-in' using errcode = 'RB004';
  end if;
  if v_booking.checked_in = p_checked then
    return p_checked;
  end if;

  update public.bookings set checked_in = p_checked where id = p_booking_id;
  insert into public.booking_events (booking_id, actor, text)
  values (p_booking_id, public.staff_actor(), case when p_checked then 'Check-in realizado' else 'Check-in deshecho' end);
  return p_checked;
end;
$$;

revoke all on function public.booking_set_checked_in(uuid, boolean) from public, anon;
grant execute on function public.booking_set_checked_in(uuid, boolean) to authenticated;

-- «Marcar todos»: check-in de las reservas confirmadas de la salida que aún no lo tienen.
-- Devuelve cuántas se han marcado.
create function public.session_check_in_all(p_session_id uuid)
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
  if not exists (select 1 from public.sessions where id = p_session_id) then
    raise exception 'Salida no encontrada' using errcode = 'no_data_found';
  end if;

  with marked as (
    update public.bookings
    set checked_in = true
    where session_id = p_session_id and status = 'confirmed' and not checked_in
    returning id
  )
  insert into public.booking_events (booking_id, actor, text)
  select id, public.staff_actor(), 'Check-in realizado' from marked;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.session_check_in_all(uuid) from public, anon;
grant execute on function public.session_check_in_all(uuid) to authenticated;

-- Cobro ------------------------------------------------------------------------------------------

-- Cobra en destino (efectivo o TPV) el total de una reserva confirmada con el pago pendiente.
-- Las de factura a agencia se cobran aparte y no pasan por aquí.
create function public.booking_collect_payment(p_booking_id uuid, p_method text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
begin
  if not public.is_staff() then
    raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
  end if;
  if p_method is null or p_method not in ('cash', 'card_terminal') then
    raise exception 'Método de pago no válido' using errcode = 'invalid_parameter_value';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Reserva no encontrada' using errcode = 'no_data_found';
  end if;
  if v_booking.status <> 'confirmed' or v_booking.payment_status <> 'pending' then
    raise exception 'Esta reserva no tiene un cobro pendiente' using errcode = 'RB005';
  end if;

  update public.bookings
  set payment_status = 'paid', paid_cents = total_cents, payment_method = p_method
  where id = p_booking_id;
  insert into public.booking_events (booking_id, actor, text)
  values (
    p_booking_id,
    public.staff_actor(),
    'Cobrado ' || public.format_cents(v_booking.total_cents) || ' · ' || case p_method when 'cash' then 'Efectivo' else 'TPV tarjeta' end
  );
end;
$$;

revoke all on function public.booking_collect_payment(uuid, text) from public, anon;
grant execute on function public.booking_collect_payment(uuid, text) to authenticated;

-- Estado de la salida ----------------------------------------------------------------------------

-- A la venta, venta cerrada o cancelada. Cancelar cancela también sus reservas confirmadas y
-- pendientes (el reembolso de lo cobrado llega con la tarea 2.4). Devuelve cuántas reservas se
-- han cancelado. Toma la salida con el mismo cerrojo que create_booking_hold y generate_sessions.
create function public.session_set_status(p_session_id uuid, p_status text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_count integer := 0;
begin
  if not public.is_staff() then
    raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
  end if;
  if p_status is null or p_status not in ('open', 'closed', 'cancelled') then
    raise exception 'Estado no válido' using errcode = 'invalid_parameter_value';
  end if;

  perform pg_advisory_xact_lock_shared(hashtext('public.generate_sessions'));
  select * into v_session from public.sessions where id = p_session_id for update;
  if not found then
    raise exception 'Salida no encontrada' using errcode = 'no_data_found';
  end if;
  if v_session.status = p_status then
    return 0;
  end if;

  update public.sessions set status = p_status where id = p_session_id;

  if p_status = 'cancelled' then
    with cancelled as (
      update public.bookings
      set status = 'cancelled', hold_expires_at = null
      where session_id = p_session_id and status in ('pending', 'confirmed')
      returning id
    )
    insert into public.booking_events (booking_id, actor, text)
    select id, public.staff_actor(), 'Reserva cancelada: salida cancelada por la empresa' from cancelled;
    get diagnostics v_count = row_count;
  end if;
  return v_count;
end;
$$;

revoke all on function public.session_set_status(uuid, text) from public, anon;
grant execute on function public.session_set_status(uuid, text) to authenticated;
