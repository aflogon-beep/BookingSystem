-- Tarea 3.1: recursos (guías, vehículos y material), lo que necesita cada producto y la
-- asignación de recursos a salidas con la restricción de solapes en BD.

create extension if not exists btree_gist with schema extensions;

-- Recursos ----------------------------------------------------------------------------------

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  type text not null check (type in ('guide', 'vehicle', 'equipment')),
  seats integer not null default 1 check (seats between 1 and 100),
  languages text[] not null default '{}'
    check (cardinality(languages) <= 10 and array_to_string(languages, ',') ~ '^([a-z]{2}(,[a-z]{2})*)?$'),
  created_at timestamptz not null default now(),
  constraint resources_guide_one_seat check (type <> 'guide' or seats = 1),
  constraint resources_languages_only_guides check (type = 'guide' or cardinality(languages) = 0)
);

comment on table public.resources is 'Guías, vehículos y material que se asignan a las salidas.';
comment on column public.resources.seats is
  'Vehículos: asientos. Material: unidades. Guías: siempre 1.';
comment on column public.resources.languages is 'Guías: idiomas en los que guía (códigos ISO de 2 letras).';

alter table public.resources enable row level security;
revoke all on table public.resources from anon, authenticated;
grant select, insert, update, delete on table public.resources to authenticated;

create policy resources_select_staff on public.resources
  for select to authenticated
  using ((select public.is_staff()));

create policy resources_insert_staff on public.resources
  for insert to authenticated
  with check ((select public.is_staff()));

create policy resources_update_staff on public.resources
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

create policy resources_delete_staff on public.resources
  for delete to authenticated
  using ((select public.is_staff()));

-- Lo que necesita cada salida de un producto ------------------------------------------------

create table public.product_needs (
  product_id uuid not null references public.products (id) on delete cascade,
  resource_type text not null check (resource_type in ('guide', 'vehicle', 'equipment')),
  qty integer not null check (qty between 1 and 5),
  primary key (product_id, resource_type)
);

comment on table public.product_needs is
  'Cuántos recursos de cada tipo necesita cada salida del producto. Sin fila: no necesita ninguno.';

alter table public.product_needs enable row level security;
revoke all on table public.product_needs from anon, authenticated;
grant select, insert, update, delete on table public.product_needs to authenticated;

create policy product_needs_select_staff on public.product_needs
  for select to authenticated
  using ((select public.is_staff()));

create policy product_needs_insert_staff on public.product_needs
  for insert to authenticated
  with check ((select public.is_staff()));

create policy product_needs_update_staff on public.product_needs
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

create policy product_needs_delete_staff on public.product_needs
  for delete to authenticated
  using ((select public.is_staff()));

-- Recursos asignados a salidas --------------------------------------------------------------

-- period copia el horario de la salida (lo rellena un trigger) para que la restricción de
-- exclusión impida que un recurso esté en dos salidas que se solapan.
create table public.session_resources (
  session_id uuid not null references public.sessions (id) on delete cascade,
  resource_id uuid not null references public.resources (id) on delete cascade,
  -- El default solo existe para no tener que enviarlo: el trigger siempre lo sustituye.
  period tstzrange not null default 'empty' check (not isempty(period)),
  created_at timestamptz not null default now(),
  primary key (session_id, resource_id),
  constraint session_resources_no_overlap exclude using gist (resource_id with =, period with &&)
);

comment on table public.session_resources is 'Recursos asignados a cada salida. Un recurso no puede estar en dos salidas a la vez.';
comment on column public.session_resources.period is 'Horario de la salida [inicio, fin). Lo mantiene un trigger.';

create index session_resources_resource_idx on public.session_resources (resource_id);

alter table public.session_resources enable row level security;
revoke all on table public.session_resources from anon, authenticated;
grant select, insert, update, delete on table public.session_resources to authenticated;

create policy session_resources_select_staff on public.session_resources
  for select to authenticated
  using ((select public.is_staff()));

create policy session_resources_insert_staff on public.session_resources
  for insert to authenticated
  with check ((select public.is_staff()));

create policy session_resources_update_staff on public.session_resources
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

create policy session_resources_delete_staff on public.session_resources
  for delete to authenticated
  using ((select public.is_staff()));

-- Copia el horario de la salida en period. No se asignan recursos a salidas canceladas.
create function public.session_resources_set_period()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.sessions%rowtype;
begin
  select * into v_session from public.sessions where id = new.session_id;
  if not found then
    raise exception 'Salida no encontrada' using errcode = 'foreign_key_violation';
  end if;
  if v_session.status = 'cancelled' then
    raise exception 'La salida está cancelada' using errcode = 'check_violation';
  end if;
  new.period := tstzrange(v_session.starts_at, v_session.ends_at, '[)');
  return new;
end;
$$;

create trigger session_resources_set_period
  before insert or update on public.session_resources
  for each row execute function public.session_resources_set_period();

-- Si una salida se cancela, libera sus recursos. Si cambia de hora (mover una salida o cambiar la
-- duración del producto), mueve las asignaciones; los recursos que ya estén ocupados en la hora
-- nueva se quitan de esta salida (la salida se queda sin ellos, nunca con un solape).
create function public.sessions_sync_resources()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_period tstzrange := tstzrange(new.starts_at, new.ends_at, '[)');
begin
  if new.status = 'cancelled' then
    delete from public.session_resources where session_id = new.id;
    return null;
  end if;
  if (new.starts_at, new.ends_at) is distinct from (old.starts_at, old.ends_at) then
    delete from public.session_resources sr
    where sr.session_id = new.id
      and exists (
        select 1 from public.session_resources other
        where other.resource_id = sr.resource_id
          and other.session_id <> new.id
          and other.period && v_period
      );
    update public.session_resources set period = v_period where session_id = new.id;
  end if;
  return null;
end;
$$;

create trigger sessions_sync_resources
  after update of starts_at, ends_at, status on public.sessions
  for each row execute function public.sessions_sync_resources();

revoke all on function public.session_resources_set_period() from public, anon, authenticated;
revoke all on function public.sessions_sync_resources() from public, anon, authenticated;

-- save_product guarda también lo que necesita cada salida (p_product->'needs', p. ej.
-- {"guide": 1, "vehicle": 1}). Si no llega «needs», no se tocan.
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
    insert into public.product_needs (product_id, resource_type, qty)
    select v_id, need.key, (need.value)::integer
    from jsonb_each(p_product->'needs') as need
    where (need.value)::integer > 0;
  end if;

  return jsonb_build_object('id', v_id, 'previous_photo_path', v_previous_photo);
end;
$$;

-- Productos que ya existían: un guía por salida (lo que pone el prototipo a un producto nuevo).
insert into public.product_needs (product_id, resource_type, qty)
select id, 'guide', 1 from public.products
on conflict do nothing;
