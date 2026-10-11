-- Editar una reserva ya hecha desde el panel (como FareHarbor): cambiar sus entradas y corregir
-- los datos del cliente, con historial. Antes había que cancelarla y crear otra.

-- Cambia las entradas de una reserva confirmada de una salida que aún no ha empezado.
--   · Las plazas se comprueban con la salida bloqueada (como al reservar).
--   · El precio se recalcula aquí: las entradas que ya tenía mantienen su precio; las nuevas, el
--     precio actual del producto.
--   · Solo con el pago pendiente o a facturar: si ya está pagada, cambiar el importe exigiría un
--     cobro o reembolso parcial (pendiente con Stripe).
-- Devuelve el nuevo total en céntimos.
create function public.booking_update_lines(p_booking_id uuid, p_lines jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_session public.sessions;
  v_line_count integer;
  v_distinct integer;
  v_priced integer;
  v_qty_ok boolean;
  v_seats integer;
  v_old_seats integer;
  v_total bigint;
  v_pax integer;
  v_old_text text;
  v_new_text text;
  v_lines jsonb;
begin
  if not public.is_staff() then
    raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 20 then
    raise exception 'Entradas no válidas' using errcode = 'RB003';
  end if;

  perform pg_advisory_xact_lock_shared(hashtext('public.generate_sessions'));
  perform public.lock_booking_with_session(p_booking_id);
  select * into v_booking from public.bookings where id = p_booking_id;
  select * into v_session from public.sessions where id = v_booking.session_id;

  if v_booking.status <> 'confirmed' or v_session.starts_at <= now() then
    raise exception 'La reserva ya no se puede cambiar' using errcode = 'RB009';
  end if;
  if v_booking.payment_status not in ('pending', 'invoice') then
    raise exception 'La reserva ya está pagada' using errcode = 'RB013';
  end if;

  -- Entradas pedidas con su tipo y su precio: el que ya tenían en la reserva o, si son nuevas, el
  -- actual del producto. Sin tipo o sin precio, takes_seat o unit_price_cents quedan a null.
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
        'ticket_type_id', r.ticket_type_id,
        'qty', r.qty,
        'takes_seat', t.takes_seat,
        'unit_price_cents', coalesce(prev.unit_price_cents, pp.price_cents),
        'ticket_name', t.name,
        'sort', t.sort)), '[]'::jsonb)
    into v_lines
    from (
      select (line->>'ticket_type_id')::uuid as ticket_type_id, (line->>'qty')::integer as qty
      from jsonb_array_elements(p_lines) as line
    ) r
    left join public.ticket_types t on t.id = r.ticket_type_id
    left join public.product_prices pp on pp.product_id = v_session.product_id and pp.ticket_type_id = r.ticket_type_id
    left join public.booking_lines prev on prev.booking_id = p_booking_id and prev.ticket_type_id = r.ticket_type_id;
  exception when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then
    raise exception 'Entradas no válidas' using errcode = 'RB003';
  end;

  select count(*), count(distinct ticket_type_id),
    count(*) filter (where takes_seat is not null and unit_price_cents is not null),
    bool_and(coalesce(qty between 1 and 100, false)),
    coalesce(sum(qty) filter (where takes_seat), 0),
    coalesce(sum(qty::bigint * unit_price_cents), 0),
    coalesce(sum(qty), 0)
  into v_line_count, v_distinct, v_priced, v_qty_ok, v_seats, v_total, v_pax
  from jsonb_to_recordset(v_lines) as l(ticket_type_id uuid, qty integer, takes_seat boolean, unit_price_cents integer);
  if v_distinct <> v_line_count or v_priced <> v_line_count or not coalesce(v_qty_ok, false) then
    raise exception 'Entradas no válidas' using errcode = 'RB003';
  end if;
  if v_seats = 0 then
    raise exception 'La reserva necesita al menos una entrada con plaza' using errcode = 'RB003';
  end if;
  if v_total > 2147483647 then
    raise exception 'Importe demasiado alto' using errcode = 'RB003';
  end if;

  select coalesce(sum(qty) filter (where takes_seat), 0) into v_old_seats
  from public.booking_lines where booking_id = p_booking_id;
  if v_seats > v_old_seats then
    -- Más plazas: como una reserva nueva, la salida tiene que estar a la venta y tener sitio.
    if v_session.status <> 'open' then
      raise exception 'La salida no admite reservas' using errcode = 'RB002';
    end if;
    if v_seats - v_old_seats > v_session.capacity - public.session_occupied_seats(v_session.id) then
      raise exception 'No quedan plazas suficientes' using
        errcode = 'RB001', hint = greatest(v_session.capacity - public.session_occupied_seats(v_session.id), 0)::text;
    end if;
  end if;

  select string_agg(l.qty || ' ' || lower(t.name), ' · ' order by t.sort, t.name) into v_old_text
  from public.booking_lines l join public.ticket_types t on t.id = l.ticket_type_id
  where l.booking_id = p_booking_id;
  select string_agg(qty || ' ' || lower(ticket_name), ' · ' order by sort, ticket_name) into v_new_text
  from jsonb_to_recordset(v_lines) as l(qty integer, ticket_name text, sort integer);
  if v_old_text is not distinct from v_new_text then
    return v_booking.total_cents;
  end if;

  delete from public.booking_lines where booking_id = p_booking_id;
  insert into public.booking_lines (booking_id, ticket_type_id, qty, unit_price_cents, takes_seat)
  select p_booking_id, ticket_type_id, qty, unit_price_cents, takes_seat
  from jsonb_to_recordset(v_lines) as l(ticket_type_id uuid, qty integer, takes_seat boolean, unit_price_cents integer);

  update public.bookings
  set total_cents = v_total,
    -- Si llegó parte del grupo y ahora el grupo es de ese tamaño o menos, han llegado todos.
    arrived_pax = case when arrived_pax >= v_pax then null else arrived_pax end
  where id = p_booking_id;

  insert into public.booking_events (booking_id, actor, text)
  values (p_booking_id, public.staff_actor(),
    format('Entradas cambiadas: %s → %s · total %s', v_old_text, v_new_text, public.format_cents(v_total::integer)));
  return v_total::integer;
end;
$$;

revoke all on function public.booking_update_lines(uuid, jsonb) from public, anon;
grant execute on function public.booking_update_lines(uuid, jsonb) to authenticated;

-- Corrige nombre, email y teléfono del cliente y el hotel de recogida de una reserva, con
-- historial. El cliente es el mismo en todas sus reservas: el cambio se ve en todas.
create function public.booking_update_details(p_booking_id uuid, p_details jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_customer public.customers;
  v_name text := btrim(coalesce(p_details->>'name', ''));
  v_email text := lower(nullif(btrim(coalesce(p_details->>'email', '')), ''));
  v_phone text := nullif(btrim(coalesce(p_details->>'phone', '')), '');
  v_hotel text := btrim(coalesce(p_details->>'hotel', ''));
  v_changes text[] := '{}';
begin
  if not public.is_staff() then
    raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
  end if;
  if char_length(v_name) not between 1 and 120 or coalesce(char_length(v_email), 0) > 200
    or coalesce(char_length(v_phone), 0) > 40 or char_length(v_hotel) > 200 then
    raise exception 'Datos no válidos' using errcode = 'invalid_parameter_value';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Reserva no encontrada' using errcode = 'no_data_found';
  end if;
  select * into v_customer from public.customers where id = v_booking.customer_id for update;
  if v_customer.anonymized_at is not null then
    raise exception 'Cliente anonimizado' using errcode = 'RB011';
  end if;

  if v_customer.name <> v_name then v_changes := array_append(v_changes, 'nombre'); end if;
  if v_customer.email is distinct from v_email then v_changes := array_append(v_changes, 'email'); end if;
  if v_customer.phone is distinct from v_phone then v_changes := array_append(v_changes, 'teléfono'); end if;
  if v_booking.hotel <> v_hotel then v_changes := array_append(v_changes, 'hotel'); end if;
  if cardinality(v_changes) = 0 then
    return;
  end if;

  update public.customers set name = v_name, email = v_email, phone = v_phone where id = v_customer.id;
  update public.bookings set hotel = v_hotel where id = p_booking_id;
  insert into public.booking_events (booking_id, actor, text)
  values (p_booking_id, public.staff_actor(), 'Datos cambiados: ' || array_to_string(v_changes, ', '));
end;
$$;

revoke all on function public.booking_update_details(uuid, jsonb) from public, anon;
grant execute on function public.booking_update_details(uuid, jsonb) to authenticated;
