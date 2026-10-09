-- Catálogo: ajustes del negocio, tipos de entrada, productos, precios y reglas de horario.
--
-- Permisos (RLS):
--   anon            nada. La web pública lee el catálogo desde el servidor.
--   staff           lee todo y gestiona productos, precios y horarios (sección Productos).
--   admin           además cambia ajustes y tipos de entrada (sección Ajustes).

-- Ajustes ---------------------------------------------------------------------------------------

-- Fila única (id = 1): un solo negocio.
create table public.settings (
  id integer primary key default 1 check (id = 1),
  business_name text not null default 'Mi empresa de tours'
    check (char_length(btrim(business_name)) between 1 and 120),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'Atlantic/Canary',
  languages text[] not null default '{es}'
    check (cardinality(languages) >= 1 and array_position(languages, null) is null),
  cutoff_hours integer not null default 2 check (cutoff_hours between 0 and 720),
  cancel_hours integer not null default 24 check (cancel_hours between 0 and 720),
  default_capacity integer not null default 12 check (default_capacity between 1 and 500),
  email text not null default '' check (char_length(email) <= 254),
  phone text not null default '' check (char_length(phone) <= 40),
  created_at timestamptz not null default now()
);

comment on table public.settings is 'Ajustes del negocio. Siempre una sola fila (id = 1).';
comment on column public.settings.cutoff_hours is 'La web no vende salidas que empiecen antes de now() + cutoff_hours.';
comment on column public.settings.cancel_hours is 'Cancelación gratuita hasta estas horas antes de la salida.';
comment on column public.settings.default_capacity is 'Aforo propuesto al crear un producto.';

-- La fila existe desde el principio: el panel solo la actualiza.
insert into public.settings default values;

-- Tipos de entrada --------------------------------------------------------------------------------

create table public.ticket_types (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  note text not null default '' check (char_length(note) <= 120),
  takes_seat boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.ticket_types is 'Tipos de entrada del negocio (adulto, niño, bebé…).';
comment on column public.ticket_types.takes_seat is 'false: cuenta como pasajero pero no resta aforo (bebé en brazos).';

-- Productos ---------------------------------------------------------------------------------------

create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 4000),
  meeting_point text not null default '' check (char_length(meeting_point) <= 200),
  place text not null default '' check (char_length(place) <= 200),
  duration_min integer not null check (duration_min between 15 and 1440),
  capacity integer not null check (capacity between 1 and 500),
  min_pax integer not null default 1 check (min_pax >= 1),
  pickup boolean not null default false,
  color text not null default '#0A84FF' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  photo_path text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint products_min_pax_within_capacity check (min_pax <= capacity)
);

comment on table public.products is 'Tours que vende el negocio.';
comment on column public.products.photo_path is 'Ruta de la foto en Supabase Storage (tarea 1.3).';

-- Precio de cada tipo de entrada que vende el producto. Sin fila = el producto no lo vende.
create table public.product_prices (
  product_id uuid not null references public.products (id) on delete cascade,
  ticket_type_id uuid not null references public.ticket_types (id) on delete restrict,
  price_cents integer not null check (price_cents >= 0),
  created_at timestamptz not null default now(),
  primary key (product_id, ticket_type_id)
);

comment on table public.product_prices is 'Tarifa vigente por producto y tipo de entrada, en céntimos.';

create index product_prices_ticket_type_id_idx on public.product_prices (ticket_type_id);

-- Reglas de horario: de ellas se generan las salidas (tarea 1.4). Horas locales de Atlantic/Canary.
create table public.schedule_rules (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  weekdays integer[] not null
    check (cardinality(weekdays) >= 1 and weekdays <@ '{1,2,3,4,5,6,7}'::integer[]),
  times time[] not null
    check (cardinality(times) >= 1 and array_position(times, null) is null),
  language text not null check (language ~ '^[a-z]{2}$'),
  valid_from date,
  valid_to date,
  created_at timestamptz not null default now(),
  constraint schedule_rules_valid_range check (valid_to is null or valid_from is null or valid_to >= valid_from)
);

comment on table public.schedule_rules is 'Días (ISO, 1 = lunes), horas locales e idioma en que sale un producto.';
comment on column public.schedule_rules.times is 'Horas locales de Atlantic/Canary.';
comment on column public.schedule_rules.valid_from is 'Inicio de temporada (incluido). null = sin límite.';
comment on column public.schedule_rules.valid_to is 'Fin de temporada (incluido). null = sin límite.';

create index schedule_rules_product_id_idx on public.schedule_rules (product_id);

-- RLS ---------------------------------------------------------------------------------------------

alter table public.settings enable row level security;
alter table public.ticket_types enable row level security;
alter table public.products enable row level security;
alter table public.product_prices enable row level security;
alter table public.schedule_rules enable row level security;

revoke all on table public.settings, public.ticket_types, public.products,
  public.product_prices, public.schedule_rules from anon, authenticated;

-- Ajustes: solo se actualizan (nunca se crea ni se borra la fila) y nunca cambia el id.
grant select on table public.settings to authenticated;
grant update (business_name, currency, timezone, languages, cutoff_hours, cancel_hours,
  default_capacity, email, phone) on table public.settings to authenticated;

grant select, insert, update, delete on table public.ticket_types, public.products,
  public.product_prices, public.schedule_rules to authenticated;

create policy settings_select_staff on public.settings
  for select to authenticated
  using ((select public.is_staff()));

create policy settings_update_admin on public.settings
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy ticket_types_select_staff on public.ticket_types
  for select to authenticated
  using ((select public.is_staff()));

create policy ticket_types_insert_admin on public.ticket_types
  for insert to authenticated
  with check ((select public.is_admin()));

create policy ticket_types_update_admin on public.ticket_types
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy ticket_types_delete_admin on public.ticket_types
  for delete to authenticated
  using ((select public.is_admin()));

create policy products_select_staff on public.products
  for select to authenticated
  using ((select public.is_staff()));

create policy products_insert_staff on public.products
  for insert to authenticated
  with check ((select public.is_staff()));

create policy products_update_staff on public.products
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

create policy products_delete_staff on public.products
  for delete to authenticated
  using ((select public.is_staff()));

create policy product_prices_select_staff on public.product_prices
  for select to authenticated
  using ((select public.is_staff()));

create policy product_prices_insert_staff on public.product_prices
  for insert to authenticated
  with check ((select public.is_staff()));

create policy product_prices_update_staff on public.product_prices
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

create policy product_prices_delete_staff on public.product_prices
  for delete to authenticated
  using ((select public.is_staff()));

create policy schedule_rules_select_staff on public.schedule_rules
  for select to authenticated
  using ((select public.is_staff()));

create policy schedule_rules_insert_staff on public.schedule_rules
  for insert to authenticated
  with check ((select public.is_staff()));

create policy schedule_rules_update_staff on public.schedule_rules
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

create policy schedule_rules_delete_staff on public.schedule_rules
  for delete to authenticated
  using ((select public.is_staff()));
