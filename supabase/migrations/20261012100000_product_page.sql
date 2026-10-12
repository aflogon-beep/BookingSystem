-- Ficha de producto ampliada (estilo GetYourGuide / Bókun): galería de fotos, frase corta, lo más
-- destacado, itinerario por paradas, incluye / no incluye, qué llevar, información importante y
-- dificultad. Todo opcional y con versión en inglés para la web /en (vacío: se ve el español).

-- Lista de textos cortos (una línea cada uno): como mucho `max_items` elementos de `max_len`
-- caracteres, sin elementos vacíos. Inmutable para poder usarla en un check.
create function public.text_list_ok(items text[], max_items integer, max_len integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(cardinality(items), 0) <= max_items
    and not exists (select 1 from unnest(items) as item where item is null or char_length(btrim(item)) not between 1 and max_len);
$$;

alter table public.products
  add column tagline text not null default '' check (char_length(tagline) <= 160),
  add column tagline_en text not null default '' check (char_length(tagline_en) <= 160),
  add column highlights text[] not null default '{}' check (public.text_list_ok(highlights, 12, 200)),
  add column highlights_en text[] not null default '{}' check (public.text_list_ok(highlights_en, 12, 200)),
  add column included text[] not null default '{}' check (public.text_list_ok(included, 15, 200)),
  add column included_en text[] not null default '{}' check (public.text_list_ok(included_en, 15, 200)),
  add column not_included text[] not null default '{}' check (public.text_list_ok(not_included, 15, 200)),
  add column not_included_en text[] not null default '{}' check (public.text_list_ok(not_included_en, 15, 200)),
  add column bring text[] not null default '{}' check (public.text_list_ok(bring, 15, 200)),
  add column bring_en text[] not null default '{}' check (public.text_list_ok(bring_en, 15, 200)),
  add column good_to_know text not null default '' check (char_length(good_to_know) <= 2000),
  add column good_to_know_en text not null default '' check (char_length(good_to_know_en) <= 2000),
  add column difficulty text check (difficulty in ('easy', 'moderate', 'hard'));

comment on column public.products.tagline is 'Frase corta bajo el nombre en la web.';
comment on column public.products.highlights is 'Lo más destacado: una frase por elemento.';
comment on column public.products.bring is 'Qué llevar.';
comment on column public.products.good_to_know is 'Información importante antes de reservar.';
comment on column public.products.photo_path is 'Foto de portada en Supabase Storage. El resto de la galería, en product_photos.';

-- Paradas del itinerario, en orden.
create table public.product_stops (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  position integer not null check (position between 1 and 20),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  title_en text not null default '' check (char_length(title_en) <= 120),
  description text not null default '' check (char_length(description) <= 1000),
  description_en text not null default '' check (char_length(description_en) <= 1000),
  duration_min integer check (duration_min between 1 and 1440),
  unique (product_id, position)
);

comment on table public.product_stops is 'Itinerario del producto: paradas en orden, con duración opcional.';

alter table public.product_stops enable row level security;
revoke all on table public.product_stops from anon, authenticated;
grant select, insert, update, delete on table public.product_stops to authenticated;

create policy product_stops_select_staff on public.product_stops
  for select to authenticated
  using ((select public.is_staff()));

create policy product_stops_insert_staff on public.product_stops
  for insert to authenticated
  with check ((select public.is_staff()));

create policy product_stops_update_staff on public.product_stops
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

create policy product_stops_delete_staff on public.product_stops
  for delete to authenticated
  using ((select public.is_staff()));

-- Galería: fotos además de la portada (products.photo_path), en orden. Los archivos están en el
-- bucket product-photos, con sus políticas de 20261009120000.
create table public.product_photos (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  path text not null unique check (path ~ '^[0-9a-f-]{36}\.(jpg|png|webp)$'),
  position integer not null check (position between 1 and 20),
  created_at timestamptz not null default now(),
  unique (product_id, position)
);

comment on table public.product_photos is 'Galería de fotos del producto (sin la portada), en orden.';

alter table public.product_photos enable row level security;
revoke all on table public.product_photos from anon, authenticated;
grant select, insert, update, delete on table public.product_photos to authenticated;

create policy product_photos_select_staff on public.product_photos
  for select to authenticated
  using ((select public.is_staff()));

create policy product_photos_insert_staff on public.product_photos
  for insert to authenticated
  with check ((select public.is_staff()));

create policy product_photos_update_staff on public.product_photos
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

create policy product_photos_delete_staff on public.product_photos
  for delete to authenticated
  using ((select public.is_staff()));

-- Convierte un array jsonb de textos en text[] (null o no array: vacío).
create function public.jsonb_text_array(value jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(value) = 'array' then array(select jsonb_array_elements_text(value)) else '{}'::text[] end;
$$;

-- save_product (versión de 20261010200000) guarda también la ficha web, si llega:
--   p_product->'content'  textos de la ficha (tagline, highlights, included, not_included, bring,
--                         good_to_know con sus *_en, y difficulty)
--   p_product->'stops'    itinerario: [{title, title_en, description, description_en, duration_min}]
--   p_product->'gallery'  rutas de las fotos de la galería, en orden (sin la portada)
-- Si no llegan (asistente de configuración), se quedan como estaban. Devuelve además
-- previous_photo_paths: portada y galería anteriores, para que el servidor borre de Storage las
-- que ya no se usan (leídas con la fila bloqueada, sin carreras).
create or replace function public.save_product(p_product jsonb, p_prices jsonb, p_rules jsonb, p_id uuid default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_previous_photo text;
  v_previous_gallery text[] := '{}';
  v_content jsonb := p_product->'content';
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

    select coalesce(array_agg(path order by position), '{}') into v_previous_gallery
    from public.product_photos
    where product_id = v_id;
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

  if jsonb_typeof(v_content) = 'object' then
    update public.products
    set tagline = coalesce(v_content->>'tagline', ''),
        tagline_en = coalesce(v_content->>'tagline_en', ''),
        highlights = public.jsonb_text_array(v_content->'highlights'),
        highlights_en = public.jsonb_text_array(v_content->'highlights_en'),
        included = public.jsonb_text_array(v_content->'included'),
        included_en = public.jsonb_text_array(v_content->'included_en'),
        not_included = public.jsonb_text_array(v_content->'not_included'),
        not_included_en = public.jsonb_text_array(v_content->'not_included_en'),
        bring = public.jsonb_text_array(v_content->'bring'),
        bring_en = public.jsonb_text_array(v_content->'bring_en'),
        good_to_know = coalesce(v_content->>'good_to_know', ''),
        good_to_know_en = coalesce(v_content->>'good_to_know_en', ''),
        difficulty = nullif(v_content->>'difficulty', '')
    where id = v_id;
  end if;

  if jsonb_typeof(p_product->'stops') = 'array' then
    delete from public.product_stops where product_id = v_id;
    insert into public.product_stops (product_id, position, title, title_en, description, description_en, duration_min)
    select v_id, position, stop->>'title', coalesce(stop->>'title_en', ''), coalesce(stop->>'description', ''),
      coalesce(stop->>'description_en', ''), (stop->>'duration_min')::integer
    from jsonb_array_elements(p_product->'stops') with ordinality as item(stop, position);
  end if;

  if jsonb_typeof(p_product->'gallery') = 'array' then
    delete from public.product_photos where product_id = v_id;
    insert into public.product_photos (product_id, path, position)
    select v_id, photo #>> '{}', position
    from jsonb_array_elements(p_product->'gallery') with ordinality as item(photo, position);
  end if;

  return jsonb_build_object(
    'id', v_id,
    'previous_photo_path', v_previous_photo,
    'previous_photo_paths', to_jsonb(array_remove(array_prepend(v_previous_photo, v_previous_gallery), null))
  );
end;
$$;
