-- Salidas (tarea 1.4): tabla sessions y generate_sessions.

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  language text not null check (language ~ '^[a-z]{2}$'),
  capacity integer not null check (capacity between 1 and 500),
  capacity_custom boolean not null default false,
  status text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  created_at timestamptz not null default now(),
  constraint sessions_product_starts_unique unique (product_id, starts_at),
  constraint sessions_ends_after_starts check (ends_at > starts_at)
);

comment on table public.sessions is
  'Salidas concretas de un producto, materializadas desde schedule_rules por generate_sessions.';
comment on column public.sessions.capacity is 'Aforo de esta salida. Sigue al del producto salvo que se cambie a mano.';
comment on column public.sessions.capacity_custom is
  'true si el aforo se cambió a mano en esta salida: generate_sessions ya no lo iguala al del producto.';

-- Calendario: salidas entre dos fechas.
create index sessions_starts_at_idx on public.sessions (starts_at);

alter table public.sessions enable row level security;
revoke all on table public.sessions from anon, authenticated;
grant select, insert, update, delete on table public.sessions to authenticated;

create policy sessions_select_staff on public.sessions
  for select to authenticated
  using ((select public.is_staff()));

create policy sessions_insert_staff on public.sessions
  for insert to authenticated
  with check ((select public.is_staff()));

create policy sessions_update_staff on public.sessions
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

create policy sessions_delete_staff on public.sessions
  for delete to authenticated
  using ((select public.is_staff()));

-- Orden de las reglas ------------------------------------------------------------------------

-- Igual que en 20261009120000_product_editor.sql, salvo que las reglas guardan el orden del
-- editor en created_at (antes todas tenían el mismo y el desempate era aleatorio).
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
    insert into public.products (slug, name, description, meeting_point, place, duration_min, capacity,
      min_pax, pickup, color, photo_path, active)
    values (p_product->>'slug', p_product->>'name', p_product->>'description', p_product->>'meeting_point',
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

  return jsonb_build_object('id', v_id, 'previous_photo_path', v_previous_photo);
end;
$$;

-- Generar salidas ----------------------------------------------------------------------------

-- Materializa las salidas de los productos activos entre p_from y p_to (fechas locales del
-- negocio, ambas incluidas). Idempotente: se puede llamar las veces que haga falta.
--   * Crea las salidas futuras que piden las reglas y aún no existen (aforo del producto).
--   * En las salidas futuras abiertas que siguen en las reglas, actualiza idioma, hora de fin y
--     aforo (por si cambió la regla, la duración o el aforo del producto). El aforo no se toca si
--     se cambió a mano en esa salida (capacity_custom).
--   * Borra las salidas futuras abiertas que ya no piden las reglas (regla cambiada o producto
--     desactivado). Las cerradas o canceladas no se tocan.
-- TODO(1.6): no borrar ni cambiar salidas con reservas.
-- La hora local se convierte con Atlantic/Canary: (fecha + hora) at time zone. Una hora que no
-- existe (01:30 del cambio de marzo) queda con el offset de invierno, y una repetida (01:30 de
-- octubre) con el de invierno, igual que localToInstant en TypeScript. Si dos reglas
-- piden la misma hora, gana la primera del editor. security invoker: RLS decide (equipo o
-- service role). Un cerrojo evita que el cron y un guardado del panel se pisen.
-- Devuelve cuántas salidas se crearon o actualizaron.
create function public.generate_sessions(p_from date, p_to date, p_product_id uuid default null)
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
      and (
        (public.sessions.language, public.sessions.ends_at) is distinct from (excluded.language, excluded.ends_at)
        or (not public.sessions.capacity_custom and public.sessions.capacity <> excluded.capacity)
      );
  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

revoke all on function public.generate_sessions(date, date, uuid) from public, anon;
grant execute on function public.generate_sessions(date, date, uuid) to authenticated, service_role;

-- Primera generación al aplicar la migración (en local no hay productos todavía: el seed va después).
select public.generate_sessions(
  (now() at time zone 'Atlantic/Canary')::date,
  (now() at time zone 'Atlantic/Canary')::date + 120
);
