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
    phone = '+34 922 555 210',
    setup_done_at = now()
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

-- Textos en inglés para la web /en (La Laguna se queda sin ellos: se ve en español).
update public.ticket_types set name_en = 'Adult', note_en = '13 years and over' where id = '00000000-0000-4000-8000-000000000101';
update public.ticket_types set name_en = 'Child', note_en = '4 to 12 years' where id = '00000000-0000-4000-8000-000000000102';
update public.ticket_types set name_en = 'Infant', note_en = '0 to 3 years, on lap' where id = '00000000-0000-4000-8000-000000000103';
update public.ticket_types set name_en = 'Canary Islands resident', note_en = 'With residence certificate' where id = '00000000-0000-4000-8000-000000000104';
update public.products
set name_en = 'Teide sunset and stars',
    description_en = 'Trip up to Teide National Park, sunset over the sea of clouds and guided stargazing with a telescope. Warm clothing and hot chocolate included.',
    meeting_point_en = 'Plaza del Cristo, La Laguna'
where id = '00000000-0000-4000-8000-000000000201';
update public.products
set name_en = 'Anaga laurel forest',
    description_en = 'Guided 9 km walk through the laurel forest of Anaga Rural Park, with a stop at a traditional hamlet and a goat cheese tasting.',
    meeting_point_en = 'Cruz del Carmen visitor centre'
where id = '00000000-0000-4000-8000-000000000202';

-- Ficha web del Teide y de Anaga (La Laguna se queda sin ella: la web muestra lo básico).
update public.products
set tagline = 'Mar de nubes, puesta de sol a 2.300 m y un cielo Starlight con telescopio',
    tagline_en = 'Sea of clouds, sunset at 2,300 m and a Starlight sky through a telescope',
    highlights = '{"Atardecer sobre el mar de nubes desde el Parque Nacional","Observación de estrellas con astrónomo y telescopio profesional","Grupo reducido de 16 personas como máximo","Ropa de abrigo y chocolate caliente incluidos"}',
    highlights_en = '{"Sunset over the sea of clouds in the National Park","Stargazing with an astronomer and a professional telescope","Small group of 16 people at most","Warm clothing and hot chocolate included"}',
    included = '{"Transporte en minibús con aire acondicionado","Guía titulado","Telescopio y punteros láser","Chaqueta de abrigo","Chocolate caliente"}',
    included_en = '{"Air-conditioned minibus transport","Licensed guide","Telescope and laser pointers","Warm jacket","Hot chocolate"}',
    not_included = '{"Cena","Teleférico del Teide"}',
    not_included_en = '{"Dinner","Teide cable car"}',
    bring = '{"Calzado cómodo","Ropa de abrigo extra","Cámara de fotos","Agua"}',
    bring_en = '{"Comfortable shoes","Extra warm clothing","Camera","Water"}',
    good_to_know = 'A más de 2.000 m puede hacer frío incluso en verano. No recomendado para embarazadas ni personas con problemas respiratorios. Si el cielo está cubierto, cambiamos la fecha o devolvemos el importe.',
    good_to_know_en = 'Above 2,000 m it can be cold even in summer. Not recommended for pregnant women or people with breathing problems. If the sky is overcast, we will change the date or refund you.',
    difficulty = 'easy'
where id = '00000000-0000-4000-8000-000000000201';
update public.products
set tagline = 'Senderismo entre bosques de niebla milenarios y caseríos con vistas al Atlántico',
    tagline_en = 'Hiking through ancient cloud forests and hamlets overlooking the Atlantic',
    highlights = '{"Bosque de laurisilva, Reserva de la Biosfera","Caserío tradicional y queso de cabra","Miradores sobre la costa norte"}',
    highlights_en = '{"Laurel forest, a Biosphere Reserve","Traditional hamlet and goat cheese","Viewpoints over the north coast"}',
    included = '{"Guía de montaña","Degustación de queso","Seguro de actividad"}',
    not_included = '{"Comida"}',
    bring = '{"Botas de montaña","Chubasquero","Agua y algo de comer"}',
    difficulty = 'moderate'
where id = '00000000-0000-4000-8000-000000000202';
insert into public.product_stops (product_id, position, title, title_en, description, description_en, duration_min) values
  ('00000000-0000-4000-8000-000000000201', 1, 'Salida desde La Laguna', 'Departure from La Laguna',
   'Recogida en el punto de encuentro o en tu hotel y subida por el bosque de La Esperanza.',
   'Pickup at the meeting point or your hotel and drive up through La Esperanza forest.', 60),
  ('00000000-0000-4000-8000-000000000201', 2, 'Mirador de Chipeque', 'Chipeque viewpoint',
   'Primera parada para ver el mar de nubes desde arriba.', 'First stop to see the sea of clouds from above.', 15),
  ('00000000-0000-4000-8000-000000000201', 3, 'Atardecer en las Cañadas del Teide', 'Sunset at Las Cañadas del Teide',
   'Paseo corto entre coladas de lava mientras el sol se esconde tras La Gomera.',
   'Short walk among lava flows while the sun sets behind La Gomera.', 60),
  ('00000000-0000-4000-8000-000000000201', 4, 'Observación de estrellas', 'Stargazing',
   'Constelaciones, planetas y la Vía Láctea con telescopio y chocolate caliente.',
   'Constellations, planets and the Milky Way through a telescope, with hot chocolate.', 90),
  ('00000000-0000-4000-8000-000000000201', 5, 'Regreso', 'Return', '', '', null),
  ('00000000-0000-4000-8000-000000000202', 1, 'Cruz del Carmen', 'Cruz del Carmen', 'Encuentro en el centro de visitantes y explicación del parque.', '', 15),
  ('00000000-0000-4000-8000-000000000202', 2, 'Sendero de los Sentidos', 'Path of the Senses', 'Bosque de laurisilva entre musgos y helechos.', '', 120),
  ('00000000-0000-4000-8000-000000000202', 3, 'Caserío de Chinamada', 'Chinamada hamlet', 'Casas cueva y degustación de queso de cabra.', '', 60);

-- Equipo del prototipo y lo que necesita cada salida.
insert into public.resources (id, name, type, seats, languages) values
  ('00000000-0000-4000-8000-000000000301', 'Ana Pérez', 'guide', 1, '{es,en}'),
  ('00000000-0000-4000-8000-000000000302', 'Lukas Weber', 'guide', 1, '{de,en}'),
  ('00000000-0000-4000-8000-000000000303', 'Carmen Díaz', 'guide', 1, '{es}'),
  ('00000000-0000-4000-8000-000000000304', 'Javier Hernández', 'guide', 1, '{es,en}'),
  ('00000000-0000-4000-8000-000000000311', 'Minibús 01', 'vehicle', 16, '{}'),
  ('00000000-0000-4000-8000-000000000312', 'Minibús 02', 'vehicle', 16, '{}'),
  ('00000000-0000-4000-8000-000000000313', 'Furgoneta 08', 'vehicle', 8, '{}'),
  ('00000000-0000-4000-8000-000000000321', 'Telescopio Dobson', 'equipment', 1, '{}');

insert into public.product_needs (product_id, resource_type, qty) values
  ('00000000-0000-4000-8000-000000000201', 'guide', 1),
  ('00000000-0000-4000-8000-000000000201', 'vehicle', 1),
  ('00000000-0000-4000-8000-000000000201', 'equipment', 1),
  ('00000000-0000-4000-8000-000000000202', 'guide', 1),
  ('00000000-0000-4000-8000-000000000202', 'vehicle', 1),
  ('00000000-0000-4000-8000-000000000203', 'guide', 1);

-- Salidas de los próximos 120 días (la migración de salidas genera antes de que exista el seed).
select public.generate_sessions(
  (now() at time zone 'Atlantic/Canary')::date,
  (now() at time zone 'Atlantic/Canary')::date + 120
);
