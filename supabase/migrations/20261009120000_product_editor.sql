-- Editor de productos (tarea 1.3): guardado atómico y fotos en Storage.

-- Guardar producto ------------------------------------------------------------------------------

-- Crea (p_id null) o actualiza un producto con sus precios y reglas de horario en una sola
-- transacción. security invoker: se ejecuta con los permisos de quien llama, así que RLS
-- decide (staff y admin pueden). Precios y reglas se sustituyen enteros: las reservas guardan
-- su precio congelado y las salidas ya generadas no dependen de las reglas.
create function public.save_product(p_product jsonb, p_prices jsonb, p_rules jsonb, p_id uuid default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
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
        photo_path = p_product->>'photo_path',
        active = (p_product->>'active')::boolean
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Producto no encontrado' using errcode = 'no_data_found';
    end if;
  end if;

  delete from public.product_prices where product_id = v_id;
  insert into public.product_prices (product_id, ticket_type_id, price_cents)
  select v_id, (price->>'ticket_type_id')::uuid, (price->>'price_cents')::integer
  from jsonb_array_elements(p_prices) as price;

  delete from public.schedule_rules where product_id = v_id;
  insert into public.schedule_rules (product_id, weekdays, times, language, valid_from, valid_to)
  select v_id,
    array(select jsonb_array_elements_text(rule->'weekdays')::integer),
    array(select jsonb_array_elements_text(rule->'times')::time),
    rule->>'language',
    (rule->>'valid_from')::date,
    (rule->>'valid_to')::date
  from jsonb_array_elements(p_rules) as rule;

  return v_id;
end;
$$;

revoke all on function public.save_product(jsonb, jsonb, jsonb, uuid) from public, anon;
grant execute on function public.save_product(jsonb, jsonb, jsonb, uuid) to authenticated;

-- Fotos de producto ----------------------------------------------------------------------------

-- Bucket público: la web de reservas muestra las fotos con su URL pública. Solo imágenes de
-- hasta 5 MB (Storage lo comprueba en el servidor al subir).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-photos', 'product-photos', true, 5242880, '{image/jpeg,image/png,image/webp}')
on conflict (id) do nothing;

-- Subir, reemplazar y borrar: solo el equipo. Leer no necesita política (bucket público).
create policy product_photos_insert_staff on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-photos' and (select public.is_staff()));

create policy product_photos_update_staff on storage.objects
  for update to authenticated
  using (bucket_id = 'product-photos' and (select public.is_staff()))
  with check (bucket_id = 'product-photos' and (select public.is_staff()));

create policy product_photos_delete_staff on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-photos' and (select public.is_staff()));

-- El panel lista y borra las fotos que sustituye: necesita ver las filas del bucket.
create policy product_photos_select_staff on storage.objects
  for select to authenticated
  using (bucket_id = 'product-photos' and (select public.is_staff()));
