-- Tarea 2.5 (parte 2): textos del catálogo en inglés para la web /en. Opcionales: si están vacíos,
-- la web en inglés muestra el texto en español.

alter table public.products
  add column name_en text not null default '' check (char_length(name_en) <= 120),
  add column description_en text not null default '' check (char_length(description_en) <= 4000),
  add column meeting_point_en text not null default '' check (char_length(meeting_point_en) <= 200);

alter table public.ticket_types
  add column name_en text not null default '' check (char_length(name_en) <= 60),
  add column note_en text not null default '' check (char_length(note_en) <= 120);

-- save_product guarda también los textos en inglés (si no llegan, vacíos).
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

  return jsonb_build_object('id', v_id, 'previous_photo_path', v_previous_photo);
end;
$$;
