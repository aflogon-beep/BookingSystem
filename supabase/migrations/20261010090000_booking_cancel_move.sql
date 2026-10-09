-- Ficha de reserva (tarea 2.4): cancelar una reserva (con o sin reembolso) y cambiarla de fecha.
-- Como el resto de cambios de estado y pago, van por funciones security definer que comprueban
-- que llama el equipo, toman la salida con el mismo cerrojo que create_booking_hold y dejan
-- historial. Sin pasarela de pago, «reembolsar» registra que el equipo devuelve lo cobrado en
-- efectivo o por TPV; con Stripe, el reembolso online se pedirá antes de llamar aquí.
-- Errores nuevos: RB009 la reserva no está confirmada (o ya está cancelada).

-- Nombre del método de pago para el historial.
create function public.payment_method_label(p_method text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_method
    when 'cash' then 'Efectivo'
    when 'card_terminal' then 'TPV tarjeta'
    when 'card_online' then 'Tarjeta online'
    when 'payment_link' then 'Enlace de pago'
    when 'invoice' then 'Factura'
    else 'Sin método'
  end;
$$;

revoke all on function public.payment_method_label(text) from public, anon, authenticated;

-- Cancela una reserva que quien llama ya ha bloqueado (for update). Si estaba pagada y p_refund,
-- la marca reembolsada. Devuelve los céntimos reembolsados. Uso interno.
create function public.cancel_locked_booking(p_booking_id uuid, p_reason text, p_refund boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_refund boolean;
begin
  select * into strict v_booking from public.bookings where id = p_booking_id;
  -- Lo pagado online necesita un reembolso en Stripe (pendiente): no se marca reembolsado aquí.
  v_refund := p_refund and v_booking.payment_status = 'paid' and v_booking.payment_method is distinct from 'card_online';
  update public.bookings
  set status = 'cancelled',
    hold_expires_at = null,
    checked_in = false,
    payment_status = case when v_refund then 'refunded' else payment_status end
  where id = v_booking.id;
  -- clock_timestamp(): el reembolso queda después de la cancelación en el historial.
  insert into public.booking_events (booking_id, actor, text, created_at)
  values (v_booking.id, public.staff_actor(), p_reason, clock_timestamp());
  if v_refund then
    insert into public.booking_events (booking_id, actor, text, created_at)
    values (
      v_booking.id,
      public.staff_actor(),
      'Reembolsado ' || public.format_cents(v_booking.paid_cents) || ' · ' || public.payment_method_label(v_booking.payment_method),
      clock_timestamp()
    );
    return v_booking.paid_cents;
  end if;
  return 0;
end;
$$;

revoke all on function public.cancel_locked_booking(uuid, text, boolean) from public, anon, authenticated;

-- Bloquea la salida de una reserva y después la reserva (el mismo orden que create_booking_hold
-- y session_set_status, para no cruzarse). Si entre medias la cambiaron de salida, lo repite.
-- Devuelve la salida de la reserva.
create function public.lock_booking_with_session(p_booking_id uuid, p_other_session_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
  v_locked_session_id uuid;
begin
  for attempt in 1..3 loop
    select session_id into v_session_id from public.bookings where id = p_booking_id;
    if not found then
      raise exception 'Reserva no encontrada' using errcode = 'no_data_found';
    end if;
    -- Con dos salidas (cambio de fecha), siempre en el mismo orden.
    perform 1 from public.sessions
    where id in (v_session_id, coalesce(p_other_session_id, v_session_id))
    order by id
    for update;
    select session_id into v_locked_session_id from public.bookings where id = p_booking_id for update;
    if v_locked_session_id = v_session_id then
      return v_session_id;
    end if;
  end loop;
  raise exception 'La reserva ha cambiado. Inténtalo de nuevo.' using errcode = 'serialization_failure';
end;
$$;

revoke all on function public.lock_booking_with_session(uuid, uuid) from public, anon, authenticated;

-- Cancelar ---------------------------------------------------------------------------------------

-- Cancela una reserva confirmada (o pendiente de pago) antes de su salida. Con p_refund y la
-- reserva pagada, la marca reembolsada. Las plazas vuelven a estar a la venta al momento.
-- Devuelve los céntimos reembolsados.
create function public.booking_cancel(p_booking_id uuid, p_refund boolean default true)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_starts_at timestamptz;
begin
  if not public.is_staff() then
    raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
  end if;
  if p_refund is null then
    raise exception 'Valor no válido' using errcode = 'invalid_parameter_value';
  end if;

  perform pg_advisory_xact_lock_shared(hashtext('public.generate_sessions'));
  perform public.lock_booking_with_session(p_booking_id);
  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.status not in ('confirmed', 'pending') then
    raise exception 'La reserva ya está cancelada' using errcode = 'RB009';
  end if;
  select starts_at into v_starts_at from public.sessions where id = v_booking.session_id;
  if v_starts_at <= now() then
    raise exception 'La salida ya ha empezado' using errcode = 'RB007';
  end if;

  return public.cancel_locked_booking(v_booking.id, 'Reserva cancelada', p_refund);
end;
$$;

revoke all on function public.booking_cancel(uuid, boolean) from public, anon;
grant execute on function public.booking_cancel(uuid, boolean) to authenticated;

-- Cambiar de fecha -------------------------------------------------------------------------------

-- Mueve una reserva confirmada a otra salida del mismo producto que esté a la venta, no haya
-- empezado y tenga plazas. Las entradas y los precios no cambian (quedaron congelados al
-- reservar). Se deshace el check-in y se podrá enviar otra vez el recordatorio.
create function public.booking_move(p_booking_id uuid, p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_from public.sessions;
  v_to public.sessions;
  v_seats integer;
  v_occupied integer;
  v_timezone text;
begin
  if not public.is_staff() then
    raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
  end if;

  perform pg_advisory_xact_lock_shared(hashtext('public.generate_sessions'));
  perform public.lock_booking_with_session(p_booking_id, p_session_id);
  select * into v_booking from public.bookings where id = p_booking_id;
  select * into v_to from public.sessions where id = p_session_id;
  if not found then
    raise exception 'Salida no encontrada' using errcode = 'no_data_found';
  end if;
  select * into v_from from public.sessions where id = v_booking.session_id;

  if v_booking.status <> 'confirmed' then
    raise exception 'Solo se cambian de fecha las reservas confirmadas' using errcode = 'RB009';
  end if;
  if v_from.starts_at <= now() then
    raise exception 'La salida ya ha empezado' using errcode = 'RB007';
  end if;
  if v_to.id = v_from.id or v_to.product_id <> v_from.product_id then
    raise exception 'Elige otra salida del mismo producto' using errcode = 'invalid_parameter_value';
  end if;
  if v_to.status <> 'open' or v_to.starts_at <= now() then
    raise exception 'La salida no admite reservas' using errcode = 'RB002';
  end if;

  select coalesce(sum(qty) filter (where takes_seat), 0) into v_seats
  from public.booking_lines where booking_id = v_booking.id;
  v_occupied := public.session_occupied_seats(v_to.id);
  if v_seats > v_to.capacity - v_occupied then
    raise exception 'No quedan plazas suficientes' using
      errcode = 'RB001', hint = greatest(v_to.capacity - v_occupied, 0)::text;
  end if;

  update public.bookings
  set session_id = v_to.id, checked_in = false, reminder_sent_at = null
  where id = v_booking.id;

  select timezone into v_timezone from public.settings where id = 1;
  insert into public.booking_events (booking_id, actor, text)
  values (
    v_booking.id,
    public.staff_actor(),
    'Cambio de fecha: del ' || to_char(v_from.starts_at at time zone coalesce(v_timezone, 'Atlantic/Canary'), 'DD/MM/YYYY HH24:MI')
      || ' al ' || to_char(v_to.starts_at at time zone coalesce(v_timezone, 'Atlantic/Canary'), 'DD/MM/YYYY HH24:MI')
  );
end;
$$;

revoke all on function public.booking_move(uuid, uuid) from public, anon;
grant execute on function public.booking_move(uuid, uuid) to authenticated;

-- Cancelar una salida también reembolsa lo cobrado ------------------------------------------------

-- Igual que la versión de la 1.9, pero cada reserva se cancela con cancel_locked_booking: las
-- pagadas quedan reembolsadas (lo pendiente de la 2.4).
create or replace function public.session_set_status(p_session_id uuid, p_status text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_booking public.bookings;
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
  -- Una salida cancelada ya no vuelve: sus reservas siguen canceladas.
  if v_session.status = 'cancelled' then
    raise exception 'La salida está cancelada' using errcode = 'RB006';
  end if;
  if p_status = 'cancelled' and v_session.starts_at <= now() then
    raise exception 'La salida ya ha empezado' using errcode = 'RB007';
  end if;

  perform set_config('app.session_status_change', 'on', true);
  update public.sessions set status = p_status where id = p_session_id;
  perform set_config('app.session_status_change', '', true);

  if p_status = 'cancelled' then
    for v_booking in
      select * from public.bookings
      where session_id = p_session_id and status in ('pending', 'confirmed')
      order by id
      for update
    loop
      perform public.cancel_locked_booking(v_booking.id, 'Reserva cancelada: salida cancelada por la empresa', true);
      v_count := v_count + 1;
    end loop;
  end if;
  return v_count;
end;
$$;
