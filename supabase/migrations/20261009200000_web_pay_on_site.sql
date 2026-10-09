-- Reserva web sin pasarela de pago (decisión de 2026-10-09: Stripe queda para más adelante).
--
-- create_booking_hold acepta en p_booking `payment = 'on_site'` con el canal web: la reserva queda
-- confirmada al momento, con el pago pendiente y sin método (se cobra el día del tour desde el
-- manifiesto) y sin bloqueo temporal. Todo lo demás es igual: solo service role, producto a la
-- venta, cierre de venta, plazas comprobadas con la salida bloqueada (FOR UPDATE) y precios de la BD.
-- Como nadie paga al reservar, una reserva así admite como mucho 10 plazas (RB008): los grupos
-- reservan por teléfono.
-- Sin `payment` sigue como antes: pendiente con bloqueo de 35 min y tarjeta online (para Stripe).

create or replace function public.create_booking_hold(
  p_session_id uuid,
  p_lines jsonb,
  p_customer jsonb,
  p_booking jsonb default '{}'::jsonb,
  p_hold_minutes integer default 35
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_channel text := coalesce(p_booking->>'channel', '');
  -- Web sin pasarela: la reserva queda confirmada y se paga el día del tour.
  v_pay_on_site boolean := coalesce(p_booking->>'channel', '') = 'web' and coalesce(p_booking->>'payment', '') = 'on_site';
  v_method text := nullif(p_booking->>'payment_method', '');
  v_name text := btrim(coalesce(p_customer->>'name', ''));
  v_email text := lower(nullif(btrim(coalesce(p_customer->>'email', '')), ''));
  v_phone text := nullif(btrim(coalesce(p_customer->>'phone', '')), '');
  v_session public.sessions%rowtype;
  v_product_active boolean;
  v_cutoff_hours integer;
  v_line_count integer;
  v_distinct integer;
  v_priced integer;
  v_qty_ok boolean;
  v_seats integer;
  v_total bigint;
  v_occupied integer;
  v_customer_id uuid;
  v_booking_id uuid;
  v_code text;
  v_status text;
  v_payment_status text;
  v_hold timestamptz;
  v_attempt integer := 0;
begin
  if v_channel not in ('web', 'phone', 'desk', 'agency') then
    raise exception 'Canal no válido' using errcode = 'invalid_parameter_value';
  end if;
  if v_channel = 'web' then
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
    end if;
  elsif not public.is_staff() then
    raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
  end if;
  if v_channel = 'web' then
    if p_hold_minutes is null or p_hold_minutes not between 1 and 120 then
      raise exception 'Bloqueo no válido' using errcode = 'invalid_parameter_value';
    end if;
    if v_method is not null and v_method <> 'card_online' then
      raise exception 'Método de pago no válido' using errcode = 'invalid_parameter_value';
    end if;
    v_method := case when v_pay_on_site then null else 'card_online' end;
  elsif v_method is not null and v_method not in ('card_terminal', 'cash', 'payment_link', 'invoice') then
    raise exception 'Método de pago no válido' using errcode = 'invalid_parameter_value';
  end if;
  if char_length(v_name) not between 1 and 120 then
    raise exception 'Falta el nombre del cliente' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 20 then
    raise exception 'Entradas no válidas' using errcode = 'RB003';
  end if;

  perform pg_advisory_xact_lock_shared(hashtext('public.generate_sessions'));

  select * into v_session from public.sessions where id = p_session_id for update;
  if not found then
    raise exception 'Salida no encontrada' using errcode = 'no_data_found';
  end if;
  if v_session.status <> 'open' or v_session.starts_at <= now() then
    raise exception 'La salida no admite reservas' using errcode = 'RB002';
  end if;
  if v_channel = 'web' then
    select active into v_product_active from public.products where id = v_session.product_id;
    select cutoff_hours into v_cutoff_hours from public.settings where id = 1;
    if not coalesce(v_product_active, false)
      or v_session.starts_at < now() + make_interval(hours => coalesce(v_cutoff_hours, 0)) then
      raise exception 'La salida no admite reservas' using errcode = 'RB002';
    end if;
  end if;

  begin
  select
    count(*),
    count(distinct r.ticket_type_id),
    count(pp.ticket_type_id),
    bool_and(coalesce(r.qty between 1 and 100, false)),
    coalesce(sum(r.qty) filter (where t.takes_seat), 0),
    coalesce(sum(r.qty::bigint * pp.price_cents), 0)
  into v_line_count, v_distinct, v_priced, v_qty_ok, v_seats, v_total
  from (
    select (line->>'ticket_type_id')::uuid as ticket_type_id, (line->>'qty')::integer as qty
    from jsonb_array_elements(p_lines) as line
  ) r
  left join public.ticket_types t on t.id = r.ticket_type_id
  left join public.product_prices pp on pp.product_id = v_session.product_id and pp.ticket_type_id = r.ticket_type_id;
  exception when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then
    raise exception 'Entradas no válidas' using errcode = 'RB003';
  end;
  if v_distinct <> v_line_count or v_priced <> v_line_count or not coalesce(v_qty_ok, false) then
    raise exception 'Entradas no válidas' using errcode = 'RB003';
  end if;
  if v_seats = 0 then
    raise exception 'La reserva necesita al menos una entrada con plaza' using errcode = 'RB003';
  end if;
  if v_pay_on_site and v_seats > 10 then
    raise exception 'Demasiadas plazas para una reserva web' using errcode = 'RB008', hint = '10';
  end if;
  if v_total > 2147483647 then
    raise exception 'Importe demasiado alto' using errcode = 'RB003';
  end if;

  v_occupied := public.session_occupied_seats(v_session.id);
  if v_seats > v_session.capacity - v_occupied then
    raise exception 'No quedan plazas suficientes' using
      errcode = 'RB001', hint = greatest(v_session.capacity - v_occupied, 0)::text;
  end if;

  -- Mismo email y mismo nombre: el mismo cliente. Si no, uno nuevo (una agencia reserva con su
  -- email para clientes distintos; y nadie se une a la ficha de otro solo con su email).
  if v_email is not null then
    select id into v_customer_id
    from public.customers
    where email = v_email and lower(name) = lower(v_name)
    order by created_at
    limit 1;
  end if;
  if v_customer_id is null then
    insert into public.customers (name, email, phone)
    values (v_name, v_email, v_phone)
    returning id into v_customer_id;
  end if;

  if v_channel = 'web' and not v_pay_on_site then
    v_status := 'pending';
    v_payment_status := 'pending';
    v_hold := now() + make_interval(mins => p_hold_minutes);
  else
    v_status := 'confirmed';
    v_payment_status := case v_method
      when 'card_terminal' then 'paid'
      when 'cash' then 'paid'
      when 'invoice' then 'invoice'
      else 'pending'
    end;
  end if;

  loop
    v_attempt := v_attempt + 1;
    -- 6 caracteres de 32 posibles con bytes aleatorios seguros (los 6 primeros de un uuid v4).
    select 'VT' || string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + get_byte(b, i) % 32, 1), '' order by i)
    into v_code
    from (select uuid_send(gen_random_uuid()) as b) as random_bytes, generate_series(0, 5) as i;
    begin
      insert into public.bookings (code, session_id, customer_id, status, payment_status, payment_method, channel,
        agent, hotel, notes, total_cents, paid_cents, hold_expires_at)
      values (v_code, v_session.id, v_customer_id, v_status, v_payment_status, v_method, v_channel,
        case when v_channel = 'agency' then btrim(coalesce(p_booking->>'agent', '')) else '' end,
        btrim(coalesce(p_booking->>'hotel', '')),
        btrim(coalesce(p_booking->>'notes', '')), v_total,
        case when v_payment_status = 'paid' then v_total else 0 end, v_hold)
      returning id into v_booking_id;
      exit;
    exception when unique_violation then
      -- Código repetido (muy raro): se prueba con otro.
      if v_attempt >= 5 then
        raise;
      end if;
    end;
  end loop;

  insert into public.booking_lines (booking_id, ticket_type_id, qty, unit_price_cents, takes_seat)
  select v_booking_id, r.ticket_type_id, r.qty, pp.price_cents, t.takes_seat
  from (
    select (line->>'ticket_type_id')::uuid as ticket_type_id, (line->>'qty')::integer as qty
    from jsonb_array_elements(p_lines) as line
  ) r
  join public.ticket_types t on t.id = r.ticket_type_id
  join public.product_prices pp on pp.product_id = v_session.product_id and pp.ticket_type_id = r.ticket_type_id;

  insert into public.booking_events (booking_id, actor, text)
  values (
    v_booking_id,
    coalesce((select name from public.staff where user_id = auth.uid()), 'Web'),
    case
      when v_pay_on_site then 'Reserva creada · paga allí'
      when v_channel = 'web' then 'Reserva creada, pendiente de pago'
      else 'Reserva creada'
    end
  );

  return jsonb_build_object('id', v_booking_id, 'code', v_code, 'status', v_status, 'payment_status', v_payment_status,
    'total_cents', v_total, 'hold_expires_at', v_hold);
end;
$$;

revoke all on function public.create_booking_hold(uuid, jsonb, jsonb, jsonb, integer) from public, anon;
grant execute on function public.create_booking_hold(uuid, jsonb, jsonb, jsonb, integer) to authenticated, service_role;
