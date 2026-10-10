-- Recursos obligatorios. Cada producto dice qué recursos necesita por salida y, de cada tipo, si
-- es obligatorio:
--   * Obligatorio: la salida solo admite reservas (web y panel) si ese recurso está libre durante
--     toda la visita. Con un solo guía, la primera reserva de una salida se lo queda
--     (bookings_auto_assign) y las salidas que se solapan dejan de admitir reservas hasta que
--     termina (como la regla «sticky» de Bókun o los recursos compartidos de TuriTop).
--   * No obligatorio: se asigna si hay uno libre; si no, la salida se vende igual y sale en avisos.
-- Al cancelar, mover o borrar la última reserva activa de una salida, su equipo se libera.

alter table public.product_needs
  add column required boolean not null default true;

comment on column public.product_needs.required is
  'Obligatorio: sin este recurso libre la salida no admite reservas. Si no, solo se avisa.';

-- Lo que ya estaba configurado pasa a ser obligatorio (default true).

-- ¿Qué recurso obligatorio impide reservar esta salida? Devuelve su tipo ('guide', 'vehicle',
-- 'equipment') o null si se puede reservar:
--   * Una salida con reservas activas no se bloquea (ya hay clientes; si le falta algo, el aviso
--     «sin equipo» ya existe y el equipo lo resuelve).
--   * Para cada recurso obligatorio, tiene que haber bastantes entre los ya asignados a la salida y
--     los libres durante todo su horario (guías: que hablen su idioma). Misma elección que
--     fill_session_resources.
--   * Un tipo sin ninguna ficha dada de alta no bloquea (si no, sin guías creados no se vendería
--     nada).
create function public.session_blocking_need(p_session_id uuid)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select n.resource_type
  from public.sessions s
  join public.product_needs n on n.product_id = s.product_id and n.required
  where s.id = p_session_id
    and not exists (
      select 1 from public.bookings b
      where b.session_id = s.id
        and (b.status = 'confirmed' or (b.status = 'pending' and b.hold_expires_at > now()))
    )
    and exists (select 1 from public.resources any_r where any_r.type = n.resource_type)
    and n.qty > (
      select count(*)
      from public.resources r
      where r.type = n.resource_type
        and (
          exists (select 1 from public.session_resources own where own.session_id = s.id and own.resource_id = r.id)
          or (
            (n.resource_type <> 'guide' or s.language = any (r.languages))
            and not exists (
              select 1 from public.session_resources busy
              where busy.resource_id = r.id
                and busy.period && tstzrange(s.starts_at, s.ends_at, '[)')
            )
          )
        )
    )
  order by array_position(array['guide', 'vehicle', 'equipment'], n.resource_type)
  limit 1;
$$;

revoke all on function public.session_blocking_need(uuid) from public, anon;
grant execute on function public.session_blocking_need(uuid) to authenticated, service_role;

-- Recurso obligatorio que le falta asignado a una salida (tipo o null). Como session_blocking_need,
-- un tipo sin ninguna ficha no cuenta. Lo usa booking_move después de mover la reserva.
create function public.session_missing_required(p_session_id uuid)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select n.resource_type
  from public.sessions s
  join public.product_needs n on n.product_id = s.product_id and n.required
  where s.id = p_session_id
    and exists (select 1 from public.resources any_r where any_r.type = n.resource_type)
    and n.qty > (
      select count(*)
      from public.session_resources sr
      join public.resources r on r.id = sr.resource_id
      where sr.session_id = s.id and r.type = n.resource_type
    )
  order by array_position(array['guide', 'vehicle', 'equipment'], n.resource_type)
  limit 1;
$$;

revoke all on function public.session_missing_required(uuid) from public, anon, authenticated;

-- Por salida, si admite reservas por sus recursos y, si no, qué recurso falta. Para la web y el
-- formulario de nueva reserva. security_invoker: RLS decide (equipo y service role).
create view public.session_team_status with (security_invoker = true) as
select
  st.session_id,
  st.product_id,
  st.starts_at,
  st.blocking_need is null as team_free,
  st.blocking_need
from (
  select s.id as session_id, s.product_id, s.starts_at, public.session_blocking_need(s.id) as blocking_need
  from public.sessions s
) st;

revoke all on table public.session_team_status from anon, authenticated;
grant select on table public.session_team_status to authenticated;

-- Al cancelar, mover o borrar la última reserva activa de una salida, su equipo queda libre para
-- las salidas que se solapan. Si aún le quedan reservas, no se toca. Los triggers se llaman
-- «bookings_aa_…» para ir antes que bookings_auto_assign (Postgres los ejecuta por orden
-- alfabético): al mover una reserva a otra salida que se solapa, el guía se libera antes de
-- asignarlo en la nueva.
create function public.bookings_release_resources()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.bookings b
    where b.session_id = old.session_id
      and (b.status = 'confirmed' or (b.status = 'pending' and b.hold_expires_at > now()))
  ) then
    delete from public.session_resources where session_id = old.session_id;
  end if;
  return null;
end;
$$;

revoke all on function public.bookings_release_resources() from public, anon, authenticated;

create trigger bookings_aa_release_resources_update
  after update of status, session_id on public.bookings
  for each row
  when (old.status in ('confirmed', 'pending')
    and (new.status not in ('confirmed', 'pending') or new.session_id <> old.session_id))
  execute function public.bookings_release_resources();

create trigger bookings_aa_release_resources_delete
  after delete on public.bookings
  for each row
  when (old.status in ('confirmed', 'pending'))
  execute function public.bookings_release_resources();

-- save_product (versión de 20261010110000) guarda también si cada recurso es obligatorio
-- (p_product->'needs_required', p. ej. {"guide": true, "vehicle": false}; sin dato: obligatorio).
create or replace function public.save_product(p_product jsonb, p_prices jsonb, p_rules jsonb, p_id uuid default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_previous_photo text;
begin
  if p_id is null then
    insert into public.products (slug, name, description, meeting_point, name_en, description_en, meeting_point_en,
      place, duration_min, capacity, min_pax, pickup, color, photo_path, active)
    values (p_product->>'slug', p_product->>'name', p_product->>'description', p_product->>'meeting_point',
      coalesce(p_product->>'name_en', ''), coalesce(p_product->>'description_en', ''),
      coalesce(p_product->>'meeting_point_en', ''),
      p_product->>'place', (p_product->>'duration_min')::integer, (p_product->>'capacity')::integer,
      (p_product->>'min_pax')::integer, (p_product->>'pickup')::boolean, p_product->>'color',
      p_product->>'photo_path', (p_product->>'active')::boolean)
    returning id into v_id;
  else
    select id, photo_path into v_id, v_previous_photo
    from public.products
    where id = p_id
    for update;
    if v_id is null then
      raise exception 'Producto no encontrado' using errcode = 'no_data_found';
    end if;

    -- El slug no cambia al editar: es la URL pública del tour.
    update public.products
    set name = p_product->>'name',
        description = p_product->>'description',
        meeting_point = p_product->>'meeting_point',
        name_en = coalesce(p_product->>'name_en', ''),
        description_en = coalesce(p_product->>'description_en', ''),
        meeting_point_en = coalesce(p_product->>'meeting_point_en', ''),
        place = p_product->>'place',
        duration_min = (p_product->>'duration_min')::integer,
        capacity = (p_product->>'capacity')::integer,
        min_pax = (p_product->>'min_pax')::integer,
        pickup = (p_product->>'pickup')::boolean,
        color = p_product->>'color',
        photo_path = p_product->>'photo_path'
    where id = v_id;
  end if;

  delete from public.product_prices where product_id = v_id;
  insert into public.product_prices (product_id, ticket_type_id, price_cents)
  select v_id, (price->>'ticket_type_id')::uuid, (price->>'price_cents')::integer
  from jsonb_array_elements(p_prices) as price;

  delete from public.schedule_rules where product_id = v_id;
  -- created_at creciente en el orden del editor (1 µs por posición): así las reglas se listan en
  -- ese orden y, si dos coinciden, generate_sessions usa la primera.
  insert into public.schedule_rules (product_id, weekdays, times, language, valid_from, valid_to, created_at)
  select v_id,
    array(select jsonb_array_elements_text(rule->'weekdays')::integer),
    array(select jsonb_array_elements_text(rule->'times')::time),
    rule->>'language',
    (rule->>'valid_from')::date,
    (rule->>'valid_to')::date,
    now() + position * interval '1 microsecond'
  from jsonb_array_elements(p_rules) with ordinality as item(rule, position)
  order by position;

  if p_product ? 'needs' then
    delete from public.product_needs where product_id = v_id;
    insert into public.product_needs (product_id, resource_type, qty, required)
    select v_id, need.key, (need.value)::integer,
      coalesce((p_product->'needs_required'->>need.key)::boolean, true)
    from jsonb_each(p_product->'needs') as need
    where (need.value)::integer > 0;
  end if;

  return jsonb_build_object('id', v_id, 'previous_photo_path', v_previous_photo);
end;
$$;


-- create_booking_hold (versión de 20261009200000) con la comprobación de recursos obligatorios.
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
  v_blocking text;
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

  -- La salida necesita libres sus recursos obligatorios (session_blocking_need), en la web y en el
  -- panel. El cerrojo de asignación (después de la fila de la salida, como en
  -- assign_session_resources) hace que, si llegan a la vez reservas a dos salidas que se solapan y
  -- comparten el único guía, solo una se quede con él.
  perform pg_advisory_xact_lock(hashtext('public.assign_session_resources'));
  v_blocking := public.session_blocking_need(v_session.id);
  if v_blocking is not null then
    raise exception 'Falta un recurso obligatorio libre' using errcode = 'RB012', hint = v_blocking;
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

-- booking_move (versión de 20261010090000) con la comprobación de recursos obligatorios.
create or replace function public.booking_move(p_booking_id uuid, p_session_id uuid)
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
  v_to_empty boolean;
  v_blocking text;
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

  -- Recursos obligatorios: si la salida nueva aún no tiene reservas, la reserva movida tiene que
  -- conseguirlos. Se comprueba después de moverla porque, si deja vacía la salida de origen y esta
  -- se solapa con la nueva, su guía se libera y pasa a la nueva (bookings_aa_release_resources_*
  -- y bookings_auto_assign). Si no los consigue, se deshace todo.
  perform pg_advisory_xact_lock(hashtext('public.assign_session_resources'));
  v_to_empty := not exists (
    select 1 from public.bookings b
    where b.session_id = v_to.id
      and (b.status = 'confirmed' or (b.status = 'pending' and b.hold_expires_at > now()))
  );

  update public.bookings
  set session_id = v_to.id, checked_in = false, reminder_sent_at = null
  where id = v_booking.id;

  if v_to_empty then
    v_blocking := public.session_missing_required(v_to.id);
    if v_blocking is not null then
      raise exception 'Falta un recurso obligatorio libre' using errcode = 'RB012', hint = v_blocking;
    end if;
  end if;

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

