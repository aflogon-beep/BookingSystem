-- Datos de prueba: unas 200 reservas ficticias en las salidas abiertas de hoy a 20 días.
--
-- Se lanza desde GitHub (Actions > Datos de prueba > Run workflow > cargar). Cada reserva pasa por
-- create_booking_hold, igual que una reserva real: respeta aforos, recursos obligatorios y precios.
-- Si una salida está llena o su guía ocupado, se prueba con otra.
--
-- Marca común para borrarlas luego (borrar.sql): los clientes tienen email @ejemplo.test y las
-- reservas llevan «Datos de prueba» en las notas.

create temp table seed_log (kind text, detail text) on commit preserve rows;

do $$
declare
  v_target integer := 200;
  v_admin uuid;
  v_sessions uuid[];
  v_session uuid;
  v_product uuid;
  v_created integer := 0;
  v_attempts integer := 0;
  v_first text[] := array[
    'Lucía', 'María', 'Carmen', 'Ana', 'Laura', 'Marta', 'Sofía', 'Elena', 'Paula', 'Irene',
    'Javier', 'Carlos', 'David', 'Pablo', 'Sergio', 'Alejandro', 'Daniel', 'Álvaro', 'Jorge', 'Raúl',
    'Emma', 'Olivia', 'Charlotte', 'James', 'Oliver', 'Harry', 'Thomas', 'Jack', 'Sophie', 'Emily',
    'Hannah', 'Lena', 'Anna', 'Lukas', 'Maximilian', 'Felix', 'Jonas', 'Claire', 'Camille', 'Louis',
    'Hugo', 'Giulia', 'Francesca', 'Marco', 'Luca', 'Sanne', 'Daan', 'Freya', 'Erik', 'Ingrid'];
  v_last text[] := array[
    'García', 'Fernández', 'González', 'Rodríguez', 'López', 'Martínez', 'Sánchez', 'Pérez', 'Hernández', 'Díaz',
    'Álvarez', 'Romero', 'Torres', 'Ramírez', 'Cabrera', 'Expósito', 'Delgado', 'Morales', 'Suárez', 'Afonso',
    'Smith', 'Jones', 'Taylor', 'Brown', 'Wilson', 'Evans', 'Walker', 'Clarke', 'Müller', 'Schmidt',
    'Schneider', 'Fischer', 'Weber', 'Becker', 'Dubois', 'Martin', 'Bernard', 'Rossi', 'Bianchi', 'Romano',
    'de Vries', 'Jansen', 'Bakker', 'Andersson', 'Johansson', 'Nielsen', 'Hansen', 'Kowalski', 'Novak', 'Silva'];
  v_hotels text[] := array[
    'Hotel Botánico, Puerto de la Cruz', 'Iberostar Anthelia, Costa Adeje', 'Hotel Mencey, Santa Cruz',
    'Bahía del Duque, Costa Adeje', 'H10 Costa Adeje Palace', 'Hotel Tigaiga, Puerto de la Cruz',
    'Parador de Las Cañadas del Teide', 'Hard Rock Hotel, Playa Paraíso', 'Apartamentos Andorra, Los Cristianos',
    'Hotel Laguna Nivaria, La Laguna', 'Gran Hotel Roca Nivaria', 'Hotel Riu Garoe, Puerto de la Cruz'];
  v_agents text[] := array['Viajes Teide', 'Canarias Travel', 'TUI Tenerife', 'Jet2holidays', 'Viajes El Corte Inglés'];
  v_extras text[] := array['', '', '', '', 'Vegetariano', 'Lleva carrito de bebé', 'Celebran un cumpleaños',
    'Movilidad reducida', 'Llegarán 10 minutos antes', 'Alergia a frutos secos'];
  v_name text;
  v_email text;
  v_phone text;
  v_channel text;
  v_method text;
  v_lines jsonb;
  v_seat_types uuid[];
  v_other_types uuid[];
  v_booking jsonb;
  v_result jsonb;
  v_r double precision;
  v_extra text;
  v_id uuid;
  v_cancelled integer := 0;
begin
  select user_id into v_admin from public.staff where role = 'admin' order by created_at limit 1;
  if v_admin is null then
    raise exception 'No hay ningún administrador en el equipo';
  end if;

  -- Salidas abiertas a la venta, de dentro de una hora a dentro de 20 días, de productos activos.
  select array_agg(s.id) into v_sessions
  from public.sessions s
  join public.products p on p.id = s.product_id and p.active
  where s.status = 'open'
    and s.starts_at > now() + interval '1 hour'
    and s.starts_at < (date_trunc('day', now() at time zone 'Atlantic/Canary') + interval '21 days')
      at time zone 'Atlantic/Canary';
  if v_sessions is null then
    raise exception 'No hay salidas abiertas en los próximos 20 días';
  end if;
  insert into seed_log values ('salidas', cardinality(v_sessions)::text);

  while v_created < v_target and v_attempts < v_target * 8 loop
    v_attempts := v_attempts + 1;
    v_session := v_sessions[1 + floor(random() * cardinality(v_sessions))::integer];
    select product_id into v_product from public.sessions where id = v_session;

    select
      array_agg(t.id order by t.sort) filter (where t.takes_seat),
      array_agg(t.id order by t.sort) filter (where not t.takes_seat)
    into v_seat_types, v_other_types
    from public.product_prices pp
    join public.ticket_types t on t.id = pp.ticket_type_id
    where pp.product_id = v_product;
    continue when v_seat_types is null;

    -- Grupo: casi siempre 1 a 4 personas del primer tipo (adulto); a veces niños o un bebé.
    v_r := random();
    v_lines := jsonb_build_array(jsonb_build_object('ticket_type_id', v_seat_types[1],
      'qty', case when v_r < 0.2 then 1 when v_r < 0.65 then 2 when v_r < 0.8 then 3 when v_r < 0.93 then 4 else 5 + floor(random() * 4)::integer end));
    if cardinality(v_seat_types) > 1 and random() < 0.3 then
      v_lines := v_lines || jsonb_build_object('ticket_type_id', v_seat_types[2], 'qty', 1 + floor(random() * 2)::integer);
    end if;
    if v_other_types is not null and random() < 0.08 then
      v_lines := v_lines || jsonb_build_object('ticket_type_id', v_other_types[1], 'qty', 1);
    end if;

    v_name := v_first[1 + floor(random() * cardinality(v_first))::integer] || ' '
      || v_last[1 + floor(random() * cardinality(v_last))::integer];
    v_email := lower(regexp_replace(translate(v_name, 'áéíóúÁÉÍÓÚüÜñÑ', 'aeiouAEIOUuUnN'), '[^A-Za-z]+', '.', 'g'))
      || '.' || (100 + floor(random() * 900))::integer || '@ejemplo.test';
    v_phone := '+34 6' || lpad(floor(random() * 100000000)::integer::text, 8, '0');
    v_extra := v_extras[1 + floor(random() * cardinality(v_extras))::integer];

    -- Canal: mitad web (paga allí), el resto teléfono, mostrador y agencias.
    v_r := random();
    v_channel := case when v_r < 0.5 then 'web' when v_r < 0.7 then 'phone' when v_r < 0.82 then 'desk' else 'agency' end;
    v_method := case v_channel
      when 'phone' then (array['payment_link', 'payment_link', 'card_terminal', null])[1 + floor(random() * 4)::integer]
      when 'desk' then (array['cash', 'card_terminal', 'card_terminal'])[1 + floor(random() * 3)::integer]
      when 'agency' then 'invoice'
      else null
    end;
    v_booking := jsonb_build_object(
      'channel', v_channel,
      'notes', case when v_extra = '' then 'Datos de prueba' else v_extra || ' · Datos de prueba' end,
      'hotel', case when random() < 0.6 then v_hotels[1 + floor(random() * cardinality(v_hotels))::integer] else '' end);
    if v_channel = 'web' then
      v_booking := v_booking || jsonb_build_object('payment', 'on_site');
      perform set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, false);
    else
      perform set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', v_admin)::text, false);
      if v_method is not null then
        v_booking := v_booking || jsonb_build_object('payment_method', v_method);
      end if;
      if v_channel = 'agency' then
        v_booking := v_booking || jsonb_build_object('agent', v_agents[1 + floor(random() * cardinality(v_agents))::integer]);
      end if;
    end if;

    begin
      v_result := public.create_booking_hold(v_session, v_lines,
        jsonb_build_object('name', v_name, 'email', v_email, 'phone', v_phone), v_booking);
      v_created := v_created + 1;
    exception when others then
      -- Salida llena (RB001), guía ocupado (RB012), demasiadas plazas web (RB008)…: otra salida.
      insert into seed_log values ('rechazo', sqlstate || ' ' || sqlerrm);
    end;
  end loop;

  -- Unas pocas canceladas, como en la vida real.
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', v_admin)::text, false);
  for v_id in
    select b.id from public.bookings b join public.customers c on c.id = b.customer_id
    where c.email like '%@ejemplo.test' and b.status = 'confirmed'
    order by random() limit (v_created * 0.07)::integer
  loop
    begin
      perform public.booking_cancel(v_id, true);
      v_cancelled := v_cancelled + 1;
    exception when others then
      insert into seed_log values ('rechazo', 'cancelar: ' || sqlstate || ' ' || sqlerrm);
    end;
  end loop;

  perform set_config('request.jwt.claims', '', false);
  insert into seed_log values ('creadas', v_created::text), ('intentos', v_attempts::text), ('canceladas', v_cancelled::text);
end;
$$;

-- Resumen (una sola consulta: supabase db query muestra el resultado de la última).
select dato, valor from (
  select 1 as orden, kind as dato, detail || case when count(*) > 1 then ' (' || count(*) || ' veces)' else '' end as valor
  from seed_log group by kind, detail
  union all
  select 2, p.name || ' · ' || b.status || ' · ' || b.channel,
    count(*) || ' reservas, ' || sum(l.seats) || ' plazas, ' || to_char(sum(b.total_cents) / 100.0, 'FM999990.00') || ' €'
  from public.bookings b
  join public.customers c on c.id = b.customer_id
  join public.sessions s on s.id = b.session_id
  join public.products p on p.id = s.product_id
  join lateral (select coalesce(sum(qty) filter (where takes_seat), 0) as seats from public.booking_lines where booking_id = b.id) l on true
  where c.email like '%@ejemplo.test'
  group by p.name, b.status, b.channel
) r
order by orden, dato;
