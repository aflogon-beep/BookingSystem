-- Reservas (tarea 1.6): clientes, reservas, líneas e historial, disponibilidad por salida y
-- create_booking_hold, la única forma de crear una reserva (comprueba plazas con la salida
-- bloqueada).

-- Clientes ---------------------------------------------------------------------------------------

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  -- Guardado en minúsculas: identifica al cliente entre reservas.
  email text check (email is null or (char_length(email) <= 254 and email = lower(email) and email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$')),
  phone text check (phone is null or char_length(phone) <= 40),
  created_at timestamptz not null default now()
);

create unique index customers_email_unique on public.customers (email) where email is not null;

comment on table public.customers is 'Clientes que reservan. Se reutiliza el mismo cliente si repite email.';

-- Reservas ---------------------------------------------------------------------------------------

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^VT[0-9A-Z]{6}$'),
  -- restrict: una salida o un producto con reservas no se pueden borrar (se cancelan o desactivan).
  session_id uuid not null references public.sessions (id) on delete restrict,
  customer_id uuid not null references public.customers (id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'expired')),
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'refunded', 'invoice')),
  payment_method text check (payment_method in ('card_online', 'card_terminal', 'cash', 'payment_link', 'invoice')),
  channel text not null check (channel in ('web', 'phone', 'desk', 'agency')),
  agent text not null default '' check (char_length(agent) <= 120),
  hotel text not null default '' check (char_length(hotel) <= 200),
  notes text not null default '' check (char_length(notes) <= 2000),
  total_cents integer not null check (total_cents >= 0),
  paid_cents integer not null default 0 check (paid_cents >= 0),
  -- Solo reservas web pendientes de pago: la plaza queda bloqueada hasta esta hora.
  hold_expires_at timestamptz,
  checked_in boolean not null default false,
  stripe_checkout_id text unique,
  stripe_payment_intent text,
  created_at timestamptz not null default now()
);

comment on column public.bookings.hold_expires_at is
  'Reserva web pendiente: ocupa plaza hasta esta hora. Después la plaza se libera sola.';

create index bookings_session_status_idx on public.bookings (session_id, status);
create index bookings_customer_idx on public.bookings (customer_id);

-- Líneas por tipo de entrada, con precio y «ocupa plaza» congelados al reservar.
create table public.booking_lines (
  booking_id uuid not null references public.bookings (id) on delete cascade,
  -- restrict: un tipo de entrada vendido no se puede borrar.
  ticket_type_id uuid not null references public.ticket_types (id) on delete restrict,
  qty integer not null check (qty between 1 and 100),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  takes_seat boolean not null,
  created_at timestamptz not null default now(),
  primary key (booking_id, ticket_type_id)
);

create index booking_lines_ticket_type_idx on public.booking_lines (ticket_type_id);

-- Historial de cada reserva: solo se añade, nunca se edita.
create table public.booking_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  actor text not null check (char_length(actor) between 1 and 120),
  text text not null check (char_length(text) between 1 and 500),
  created_at timestamptz not null default now()
);

create index booking_events_booking_idx on public.booking_events (booking_id, created_at);

-- RLS --------------------------------------------------------------------------------------------

alter table public.customers enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_lines enable row level security;
alter table public.booking_events enable row level security;

revoke all on table public.customers, public.bookings, public.booking_lines, public.booking_events
  from anon, authenticated;
-- Las reservas no se borran (se cancelan) y sus líneas e historial no se editan.
grant select, insert, update, delete on table public.customers to authenticated;
grant select, insert, update on table public.bookings to authenticated;
grant select, insert on table public.booking_lines, public.booking_events to authenticated;

create policy customers_select_staff on public.customers
  for select to authenticated using ((select public.is_staff()));
create policy customers_insert_staff on public.customers
  for insert to authenticated with check ((select public.is_staff()));
create policy customers_update_staff on public.customers
  for update to authenticated using ((select public.is_staff())) with check ((select public.is_staff()));
-- Borrar datos de un cliente (por ejemplo, a petición suya) solo admin y sin reservas (restrict).
create policy customers_delete_admin on public.customers
  for delete to authenticated using ((select public.is_admin()));

create policy bookings_select_staff on public.bookings
  for select to authenticated using ((select public.is_staff()));
create policy bookings_insert_staff on public.bookings
  for insert to authenticated with check ((select public.is_staff()));
create policy bookings_update_staff on public.bookings
  for update to authenticated using ((select public.is_staff())) with check ((select public.is_staff()));

create policy booking_lines_select_staff on public.booking_lines
  for select to authenticated using ((select public.is_staff()));
create policy booking_lines_insert_staff on public.booking_lines
  for insert to authenticated with check ((select public.is_staff()));

create policy booking_events_select_staff on public.booking_events
  for select to authenticated using ((select public.is_staff()));
create policy booking_events_insert_staff on public.booking_events
  for insert to authenticated with check ((select public.is_staff()));

-- Disponibilidad ---------------------------------------------------------------------------------

-- Plazas ocupadas = entradas que ocupan plaza de reservas confirmadas y de pendientes con el
-- bloqueo vigente. Igual que occupiedSeats en lib/domain/availability.ts y que la comprobación
-- de create_booking_hold. security_invoker: RLS de sessions y bookings decide quién la ve.
create view public.session_availability with (security_invoker = true) as
select
  s.id as session_id,
  s.product_id,
  s.starts_at,
  s.capacity,
  coalesce(o.seats, 0)::integer as booked_seats,
  greatest(s.capacity - coalesce(o.seats, 0), 0)::integer as free_seats,
  coalesce(o.pax, 0)::integer as pax
from public.sessions s
left join lateral (
  select sum(l.qty) filter (where l.takes_seat) as seats, sum(l.qty) as pax
  from public.bookings b
  join public.booking_lines l on l.booking_id = b.id
  where b.session_id = s.id
    and (b.status = 'confirmed' or (b.status = 'pending' and b.hold_expires_at > now()))
) o on true;

revoke all on table public.session_availability from anon, authenticated;
grant select on table public.session_availability to authenticated;

-- Crear reserva ----------------------------------------------------------------------------------

-- Única forma de crear una reserva. Bloquea la salida (for update), calcula las plazas libres y
-- crea cliente, reserva, líneas e historial en la misma transacción: dos reservas a la vez nunca
-- pasan del aforo. Precios y «ocupa plaza» salen de la BD, nunca del cliente.
--   p_lines    [{ticket_type_id, qty}] (tipos que vende el producto, sin repetir).
--   p_customer {name, email?, phone?}: si el email ya existe se reutiliza ese cliente.
--   p_booking  {channel, payment_method?, agent?, hotel?, notes?}.
--   * channel 'web': reserva pendiente que bloquea las plazas p_hold_minutes (pago con Stripe).
--     Solo productos a la venta y respetando el cierre de venta de Ajustes (cutoff_hours).
--   * phone/desk/agency (panel): confirmada al momento hasta la hora de salida. El estado de
--     pago sale del método: TPV o efectivo, pagada; factura, a factura; si no, pendiente.
-- Errores: RB001 sin plazas suficientes (HINT = plazas libres), RB002 la salida no admite
-- reservas, RB003 entradas no válidas, P0002 salida no encontrada, 22023 otros datos.
-- security invoker: equipo (RLS) o service role (web, desde el servidor). Toma en modo
-- compartido el cerrojo de generate_sessions para que no borre una salida mientras se reserva.
create function public.create_booking_hold(
  p_session_id uuid,
  p_lines jsonb,
  p_customer jsonb,
  p_booking jsonb default '{}'::jsonb,
  p_hold_minutes integer default 35
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_channel text := coalesce(p_booking->>'channel', '');
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
    if p_hold_minutes is null or p_hold_minutes not between 1 and 120 then
      raise exception 'Bloqueo no válido' using errcode = 'invalid_parameter_value';
    end if;
    if v_method is not null and v_method <> 'card_online' then
      raise exception 'Método de pago no válido' using errcode = 'invalid_parameter_value';
    end if;
    v_method := 'card_online';
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

  select
    count(*),
    count(distinct r.ticket_type_id),
    count(pp.ticket_type_id),
    bool_and(r.qty between 1 and 100),
    coalesce(sum(r.qty) filter (where t.takes_seat), 0),
    coalesce(sum(r.qty::bigint * pp.price_cents), 0)
  into v_line_count, v_distinct, v_priced, v_qty_ok, v_seats, v_total
  from (
    select (line->>'ticket_type_id')::uuid as ticket_type_id, (line->>'qty')::integer as qty
    from jsonb_array_elements(p_lines) as line
  ) r
  left join public.ticket_types t on t.id = r.ticket_type_id
  left join public.product_prices pp on pp.product_id = v_session.product_id and pp.ticket_type_id = r.ticket_type_id;
  if v_distinct <> v_line_count or v_priced <> v_line_count or not coalesce(v_qty_ok, false) then
    raise exception 'Entradas no válidas' using errcode = 'RB003';
  end if;
  if v_seats = 0 then
    raise exception 'La reserva necesita al menos una entrada con plaza' using errcode = 'RB003';
  end if;
  if v_total > 2147483647 then
    raise exception 'Importe demasiado alto' using errcode = 'RB003';
  end if;

  select coalesce(sum(l.qty), 0) into v_occupied
  from public.bookings b
  join public.booking_lines l on l.booking_id = b.id
  where b.session_id = v_session.id
    and l.takes_seat
    and (b.status = 'confirmed' or (b.status = 'pending' and b.hold_expires_at > now()));
  if v_seats > v_session.capacity - v_occupied then
    raise exception 'No quedan plazas suficientes' using
      errcode = 'RB001', hint = greatest(v_session.capacity - v_occupied, 0)::text;
  end if;

  insert into public.customers (name, email, phone)
  values (v_name, v_email, v_phone)
  on conflict (email) where email is not null do update set email = excluded.email
  returning id into v_customer_id;

  if v_channel = 'web' then
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
    v_code := 'VT' || (
      select string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + floor(random() * 32)::integer, 1), '')
      from generate_series(1, 6)
    );
    begin
      insert into public.bookings (code, session_id, customer_id, status, payment_status, payment_method, channel,
        agent, hotel, notes, total_cents, paid_cents, hold_expires_at)
      values (v_code, v_session.id, v_customer_id, v_status, v_payment_status, v_method, v_channel,
        btrim(coalesce(p_booking->>'agent', '')), btrim(coalesce(p_booking->>'hotel', '')),
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
    case when v_channel = 'web' then 'Reserva creada, pendiente de pago' else 'Reserva creada' end
  );

  return jsonb_build_object('id', v_booking_id, 'code', v_code, 'status', v_status, 'payment_status', v_payment_status,
    'total_cents', v_total, 'hold_expires_at', v_hold);
end;
$$;

revoke all on function public.create_booking_hold(uuid, jsonb, jsonb, jsonb, integer) from public, anon;
grant execute on function public.create_booking_hold(uuid, jsonb, jsonb, jsonb, integer) to authenticated, service_role;

-- Generar salidas --------------------------------------------------------------------------------

-- Igual que en 20261009140000_sessions.sql, salvo que no borra ni cambia salidas con reservas
-- (de cualquier estado: siguen en su historial). create_booking_hold toma el mismo cerrojo en
-- modo compartido, así que mientras esto corre no entra ninguna reserva a medias.
create or replace function public.generate_sessions(p_from date, p_to date, p_product_id uuid default null)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  -- Fija, no la de Ajustes: el panel y localToInstant usan siempre la del negocio.
  v_tz constant text := 'Atlantic/Canary';
  v_count integer;
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'Rango de fechas no válido' using errcode = 'invalid_parameter_value';
  end if;

  perform pg_advisory_xact_lock(hashtext('public.generate_sessions'));

  with candidates as (
    select
      p.id as product_id,
      (day::date + slot) at time zone v_tz as starts_at,
      p.duration_min,
      p.capacity,
      r.language,
      r.created_at as rule_created_at,
      r.id as rule_id
    from public.products p
    join public.schedule_rules r on r.product_id = p.id
    cross join generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') as day
    cross join unnest(r.times) as slot
    where p.active
      and (p_product_id is null or p.id = p_product_id)
      and extract(isodow from day)::integer = any (r.weekdays)
      and (r.valid_from is null or day::date >= r.valid_from)
      and (r.valid_to is null or day::date <= r.valid_to)
  ),
  wanted as (
    select distinct on (product_id, starts_at) product_id, starts_at, duration_min, capacity, language
    from candidates
    order by product_id, starts_at, rule_created_at, rule_id
  ),
  removed as (
    delete from public.sessions s
    where s.status = 'open'
      and s.starts_at > now()
      and s.starts_at >= p_from::timestamp at time zone v_tz
      and s.starts_at < (p_to + 1)::timestamp at time zone v_tz
      and (p_product_id is null or s.product_id = p_product_id)
      and not exists (select 1 from wanted w where w.product_id = s.product_id and w.starts_at = s.starts_at)
      and not exists (select 1 from public.bookings b where b.session_id = s.id)
  )
  insert into public.sessions (product_id, starts_at, ends_at, language, capacity)
  select w.product_id, w.starts_at, w.starts_at + make_interval(mins => w.duration_min), w.language, w.capacity
  from wanted w
  where w.starts_at > now()
  on conflict (product_id, starts_at) do update
    set language = excluded.language,
        ends_at = excluded.ends_at,
        capacity = case when public.sessions.capacity_custom then public.sessions.capacity else excluded.capacity end
    where public.sessions.status = 'open'
      and not exists (select 1 from public.bookings b where b.session_id = public.sessions.id)
      and (
        (public.sessions.language, public.sessions.ends_at) is distinct from (excluded.language, excluded.ends_at)
        or (not public.sessions.capacity_custom and public.sessions.capacity <> excluded.capacity)
      );
  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

