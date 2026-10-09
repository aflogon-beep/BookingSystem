-- Datos de ejemplo para desarrollo local (se cargan con npm run db:reset).
-- Empresa de ejemplo del prototipo (prototype/index.html, función seed): Volcán Tours.
-- Ids fijos para poder referenciarlos desde tests y desde seeds posteriores.

update public.settings
set business_name = 'Volcán Tours',
    languages = '{es,en,de}',
    cutoff_hours = 2,
    cancel_hours = 24,
    default_capacity = 12,
    email = 'reservas@volcantours.es',
    phone = '+34 922 555 210'
where id = 1;

insert into public.ticket_types (id, name, note, takes_seat, sort) values
  ('00000000-0000-4000-8000-000000000101', 'Adulto', '13 años o más', true, 1),
  ('00000000-0000-4000-8000-000000000102', 'Niño', '4 a 12 años', true, 2),
  ('00000000-0000-4000-8000-000000000103', 'Bebé', '0 a 3 años, en brazos', false, 3),
  ('00000000-0000-4000-8000-000000000104', 'Residente canario', 'Con certificado de residencia', true, 4);

insert into public.products
  (id, slug, name, description, meeting_point, place, duration_min, capacity, min_pax, pickup, color)
values
  ('00000000-0000-4000-8000-000000000201', 'teide-atardecer-estrellas', 'Teide al atardecer y estrellas',
   'Subida al Parque Nacional del Teide, puesta de sol sobre el mar de nubes y observación astronómica guiada con telescopio. Incluye ropa de abrigo y chocolate caliente.',
   'Plaza del Cristo, La Laguna', 'Parque Nacional del Teide', 300, 16, 4, true, '#0A84FF'),
  ('00000000-0000-4000-8000-000000000202', 'laurisilva-anaga', 'Laurisilva de Anaga',
   'Ruta guiada de 9 km por el bosque de laurisilva del Parque Rural de Anaga, con parada en un caserío tradicional y degustación de queso de cabra.',
   'Centro de visitantes Cruz del Carmen', 'Parque Rural de Anaga', 270, 12, 3, true, '#30B158'),
  ('00000000-0000-4000-8000-000000000203', 'la-laguna-patrimonio', 'La Laguna, ciudad Patrimonio',
   'Paseo a pie por el casco histórico de San Cristóbal de La Laguna, Patrimonio de la Humanidad: casas señoriales, conventos y la catedral.',
   'Plaza del Adelantado', 'Casco histórico de La Laguna', 120, 20, 2, false, '#FF9F0A');

insert into public.product_prices (product_id, ticket_type_id, price_cents) values
  -- Teide: adulto, niño, bebé (gratis) y residente
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', 6900),
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000102', 4500),
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000103', 0),
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000104', 5500),
  -- Anaga: adulto, niño y residente
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000101', 3900),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000102', 2500),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000104', 3000),
  -- La Laguna: adulto, niño (gratis) y residente
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000101', 1800),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000102', 0),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000104', 1200);

insert into public.schedule_rules (product_id, weekdays, times, language) values
  ('00000000-0000-4000-8000-000000000201', '{1,2,3,4,5,6,7}', '{16:30}', 'es'),
  ('00000000-0000-4000-8000-000000000201', '{2,4,6}', '{17:00}', 'en'),
  ('00000000-0000-4000-8000-000000000201', '{3,7}', '{17:15}', 'de'),
  ('00000000-0000-4000-8000-000000000202', '{1,3,5,7}', '{09:00}', 'es'),
  ('00000000-0000-4000-8000-000000000202', '{2,6}', '{09:30}', 'de'),
  ('00000000-0000-4000-8000-000000000203', '{2,3,4,5,6,7}', '{10:30,17:30}', 'es'),
  ('00000000-0000-4000-8000-000000000203', '{1,3,5}', '{12:00}', 'en');
