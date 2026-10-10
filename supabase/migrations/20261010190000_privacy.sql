-- Tarea 4.5: textos legales y RGPD (borrado a petición y plazo de conservación).

-- Datos del titular para los textos legales y plazo de conservación -----------------------------

alter table public.settings
  add column legal_name text not null default '' check (char_length(legal_name) <= 200),
  add column tax_id text not null default '' check (char_length(tax_id) <= 20),
  add column address text not null default '' check (char_length(address) <= 300),
  add column customer_retention_months integer not null default 24
    check (customer_retention_months between 6 and 120);

comment on column public.settings.legal_name is 'Razón social o nombre del titular (aviso legal y privacidad).';
comment on column public.settings.tax_id is 'NIF/CIF del titular.';
comment on column public.settings.address is 'Domicilio del titular.';
comment on column public.settings.customer_retention_months is
  'Meses desde la última salida de un cliente tras los que se anonimizan sus datos (anonymize_expired_customers).';

grant update (legal_name, tax_id, address, customer_retention_months) on table public.settings to authenticated;

-- Anonimizar clientes -------------------------------------------------------------------------

alter table public.customers add column anonymized_at timestamptz;

comment on column public.customers.anonymized_at is
  'Cuándo se borraron sus datos personales. Las reservas se conservan (importes, plazas) sin datos que lo identifiquen.';

-- Borra los datos personales de un cliente y de sus reservas (hotel y notas). Las reservas se
-- quedan para que cuadren plazas e informes. Solo admin. No se puede con reservas por venir: antes
-- hay que cancelarlas (o esperar a que pasen).
create function public.anonymize_customer(p_customer_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_customer public.customers;
begin
  if not (select public.is_admin()) then
    raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
  end if;

  select * into v_customer from public.customers where id = p_customer_id for update;
  if not found then
    raise exception 'Cliente no encontrado' using errcode = 'no_data_found';
  end if;
  if v_customer.anonymized_at is not null then
    return;
  end if;

  if exists (
    select 1
    from public.bookings b
    join public.sessions s on s.id = b.session_id
    where b.customer_id = p_customer_id
      and b.status in ('pending', 'confirmed')
      and s.starts_at > now()
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

  select coalesce(array_agg(c.id), '{}') into v_ids
  from public.customers c
  where c.anonymized_at is null
    and c.created_at < v_cutoff
    and not exists (
      select 1
      from public.bookings b
      join public.sessions s on s.id = b.session_id
      where b.customer_id = c.id and s.starts_at >= v_cutoff
    );

  update public.customers
  set name = 'Cliente anonimizado', email = null, phone = null, anonymized_at = now()
  where id = any (v_ids);

  update public.bookings set hotel = '', notes = ''
  where customer_id = any (v_ids) and (hotel <> '' or notes <> '');

  return cardinality(v_ids);
end;
$$;

revoke all on function public.anonymize_expired_customers(timestamptz) from public, anon, authenticated;
grant execute on function public.anonymize_expired_customers(timestamptz) to service_role;
