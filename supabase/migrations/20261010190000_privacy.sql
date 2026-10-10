-- Tarea 4.5: textos legales y RGPD (borrado a petición y plazo de conservación).

-- Datos del titular para los textos legales y plazo de conservación -----------------------------

alter table public.settings
  add column legal_name text not null default '' check (char_length(legal_name) <= 200),
  add column tax_id text not null default '' check (char_length(tax_id) <= 20),
  add column address text not null default '' check (char_length(address) <= 300),
  add column registry_info text not null default '' check (char_length(registry_info) <= 300),
  add column tourism_registry text not null default '' check (char_length(tourism_registry) <= 60),
  add column customer_retention_months integer not null default 24
    check (customer_retention_months between 6 and 120);

comment on column public.settings.legal_name is 'Razón social o nombre del titular (aviso legal y privacidad).';
comment on column public.settings.tax_id is 'NIF/CIF del titular.';
comment on column public.settings.address is 'Domicilio del titular.';
comment on column public.settings.registry_info is 'Datos de inscripción en el Registro Mercantil (si es una sociedad).';
comment on column public.settings.tourism_registry is 'Número de inscripción en el Registro General Turístico de Canarias.';
comment on column public.settings.customer_retention_months is
  'Meses desde la última salida de un cliente tras los que se anonimizan sus datos (anonymize_expired_customers).';

grant update (legal_name, tax_id, address, registry_info, tourism_registry, customer_retention_months)
  on table public.settings to authenticated;

-- Anonimizar clientes -------------------------------------------------------------------------

alter table public.customers add column anonymized_at timestamptz;

comment on column public.customers.anonymized_at is
  'Cuándo se borraron sus datos personales. Las reservas se conservan (importes, plazas) sin datos que lo identifiquen.';

-- El equipo solo puede cambiar los datos de contacto (antes, cualquier columna). anonymized_at solo
-- lo ponen las funciones de abajo.
revoke update on table public.customers from authenticated;
grant update (name, email, phone) on table public.customers to authenticated;

-- Un cliente anonimizado no se vuelve a editar: sus datos no pueden reaparecer.
create function public.customers_guard_anonymized()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.anonymized_at is not null then
    raise exception 'Cliente anonimizado' using errcode = 'RB011';
  end if;
  return new;
end;
$$;

revoke all on function public.customers_guard_anonymized() from public, anon, authenticated;

create trigger customers_guard_anonymized
  before update on public.customers
  for each row execute function public.customers_guard_anonymized();

-- Ninguna reserva nueva se cuelga de un cliente anonimizado (create_booking_hold lo reutiliza por
-- email y nombre). FOR KEY SHARE espera a una anonimización en curso (que bloquea la fila con FOR
-- UPDATE) y lee el resultado. security definer: bloquear filas pide permiso de UPDATE.
create function public.bookings_guard_anonymized_customer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.customers where id = new.customer_id and anonymized_at is not null for key share
  ) then
    raise exception 'Cliente anonimizado' using errcode = 'RB011';
  end if;
  return new;
end;
$$;

revoke all on function public.bookings_guard_anonymized_customer() from public, anon, authenticated;

create trigger bookings_guard_anonymized_customer
  before insert or update of customer_id on public.bookings
  for each row execute function public.bookings_guard_anonymized_customer();

-- Borra los datos personales de un cliente y de sus reservas (hotel y notas). Las reservas se
-- quedan para que cuadren plazas e informes. Solo admin. No se puede con reservas por venir: antes
-- hay que cancelarlas (o esperar a que pasen). security definer: el equipo no puede tocar
-- anonymized_at directamente.
create function public.anonymize_customer(p_customer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer public.customers;
begin
  if not (select public.is_admin()) then
    raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
  end if;

  -- FOR UPDATE: una reserva nueva para este cliente espera y después la rechaza el trigger.
  select * into v_customer from public.customers where id = p_customer_id for update;
  if not found then
    raise exception 'Cliente no encontrado' using errcode = 'no_data_found';
  end if;
  if v_customer.anonymized_at is not null then
    return;
  end if;

  -- Reservas por venir que ocupan plaza (las pendientes con el bloqueo caducado no cuentan).
  if exists (
    select 1
    from public.bookings b
    join public.sessions s on s.id = b.session_id
    where b.customer_id = p_customer_id
      and s.starts_at > now()
      and (b.status = 'confirmed' or (b.status = 'pending' and (b.hold_expires_at is null or b.hold_expires_at > now())))
  ) then
    raise exception 'Tiene reservas próximas' using errcode = 'RB010';
  end if;

  update public.customers
  set name = 'Cliente anonimizado', email = null, phone = null, anonymized_at = now()
  where id = p_customer_id;

  update public.bookings set hotel = '', notes = ''
  where customer_id = p_customer_id and (hotel <> '' or notes <> '');
end;
$$;

revoke all on function public.anonymize_customer(uuid) from public, anon;
grant execute on function public.anonymize_customer(uuid) to authenticated, service_role;

-- Plazo de conservación: anonimiza los clientes cuya última salida (o su alta, si no tienen
-- reservas) es anterior a settings.customer_retention_months. La llama el job diario con la service
-- role. Devuelve cuántos ha anonimizado. p_as_of solo cambia en los tests.
create function public.anonymize_expired_customers(p_as_of timestamptz default now())
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_cutoff timestamptz;
  v_ids uuid[];
begin
  select p_as_of - make_interval(months => customer_retention_months) into v_cutoff
  from public.settings where id = 1;

  -- Primero se bloquean los candidatos (una reserva nueva para ellos espera)...
  select coalesce(array_agg(c.id), '{}') into v_ids
  from (
    select c.id
    from public.customers c
    where c.anonymized_at is null
      and c.created_at < v_cutoff
      and not exists (
        select 1
        from public.bookings b
        join public.sessions s on s.id = b.session_id
        where b.customer_id = c.id and s.starts_at >= v_cutoff
      )
    for update
  ) c;

  -- ...y se vuelve a comprobar con lo que se haya confirmado mientras tanto.
  with done as (
    update public.customers c
    set name = 'Cliente anonimizado', email = null, phone = null, anonymized_at = now()
    where c.id = any (v_ids)
      and not exists (
        select 1
        from public.bookings b
        join public.sessions s on s.id = b.session_id
        where b.customer_id = c.id and s.starts_at >= v_cutoff
      )
    returning c.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from done;

  update public.bookings set hotel = '', notes = ''
  where customer_id = any (v_ids) and (hotel <> '' or notes <> '');

  return cardinality(v_ids);
end;
$$;

revoke all on function public.anonymize_expired_customers(timestamptz) from public, anon, authenticated;
grant execute on function public.anonymize_expired_customers(timestamptz) to service_role;
