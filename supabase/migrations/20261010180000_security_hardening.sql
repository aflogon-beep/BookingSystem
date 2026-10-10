-- Tarea 4.1: revisión de seguridad.

-- Límite de intentos (reserva web y login) ------------------------------------------------------

-- Un intento por fila. Solo lo usa la app desde el servidor con la service role (rate_limit_hit):
-- RLS activado y sin políticas, nadie más lo lee ni lo escribe.
create table public.rate_limit_hits (
  key text not null check (char_length(key) between 1 and 300),
  hit_at timestamptz not null default now()
);

create index rate_limit_hits_key_hit_at_idx on public.rate_limit_hits (key, hit_at);

comment on table public.rate_limit_hits is
  'Intentos recientes por clave (p. ej. «web-booking:ip:1.2.3.4») para limitar abusos. Se purga sola.';

alter table public.rate_limit_hits enable row level security;
revoke all on table public.rate_limit_hits from anon, authenticated;

-- Registra un intento para p_key si en los últimos p_window_seconds hay menos de p_limit.
-- Devuelve false (y no registra nada) si ya se ha llegado al límite. Bloqueo por clave para que dos
-- peticiones a la vez no se cuelen las dos.
create function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_key is null or p_limit is null or p_limit < 1 or p_window_seconds is null or p_window_seconds < 1 then
    raise exception 'Parámetros no válidos' using errcode = 'invalid_parameter_value';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_key, 0));
  delete from public.rate_limit_hits
  where key = p_key and hit_at < now() - make_interval(secs => p_window_seconds);
  select count(*) into v_count from public.rate_limit_hits where key = p_key;
  if v_count >= p_limit then
    return false;
  end if;
  insert into public.rate_limit_hits (key) values (p_key);
  -- De vez en cuando se purgan las claves viejas de todo el mundo.
  if random() < 0.01 then
    delete from public.rate_limit_hits where hit_at < now() - interval '1 day';
  end if;
  return true;
end;
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

-- Salidas: el equipo solo cambia lo que la app cambia --------------------------------------------

-- Antes podía editar cualquier columna (p. ej. starts_at o product_id de una salida con reservas).
-- La app, generate_sessions y session_set_status solo tocan estas columnas.
revoke update on table public.sessions from authenticated;
grant update (capacity, capacity_custom, status, language, ends_at) on table public.sessions to authenticated;

-- Función de trigger: nadie tiene por qué llamarla directamente.
revoke all on function public.sessions_guard_cancel() from public, anon, authenticated;

-- Informes solo para admin ---------------------------------------------------------------------

-- PRD: el staff opera «sin ajustes ni informes de ingresos». Misma función, comprobando is_admin.
create or replace function public.report_summary(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_tz constant text := 'Atlantic/Canary';
  v_from timestamptz;
  v_to timestamptz;
  v_result jsonb;
begin
  if not (select public.is_admin()) then
    raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 92 then
    raise exception 'Rango no válido' using errcode = 'invalid_parameter_value';
  end if;
  v_from := p_from::timestamp at time zone v_tz;
  v_to := (p_to + 1)::timestamp at time zone v_tz;

  with bk as (
    select
      b.total_cents,
      b.channel,
      s.language,
      s.product_id,
      (s.starts_at at time zone v_tz)::date as day,
      coalesce((select sum(l.qty) from public.booking_lines l where l.booking_id = b.id), 0)::integer as pax
    from public.bookings b
    join public.sessions s on s.id = b.session_id
    where b.status = 'confirmed'
      and s.starts_at >= v_from
      and s.starts_at < v_to
  ),
  -- Plazas de las mismas reservas confirmadas (sin bloqueos web a medio pagar), para que la
  -- ocupación cuadre con ingresos y pasajeros.
  ss as (
    select
      s.product_id,
      s.capacity,
      coalesce((
        select sum(l.qty)
        from public.bookings b
        join public.booking_lines l on l.booking_id = b.id
        where b.session_id = s.id and b.status = 'confirmed' and l.takes_seat
      ), 0)::integer as booked_seats
    from public.sessions s
    where s.status <> 'cancelled'
      and s.starts_at >= v_from
      and s.starts_at < v_to
  )
  select jsonb_build_object(
    'bookings', (select count(*) from bk),
    'revenue_cents', (select coalesce(sum(total_cents), 0) from bk),
    'pax', (select coalesce(sum(pax), 0) from bk),
    'capacity', (select coalesce(sum(capacity), 0) from ss),
    'booked_seats', (select coalesce(sum(booked_seats), 0) from ss),
    'days', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'revenue_cents', d.revenue) order by d.day)
      from (select day, sum(total_cents) as revenue from bk group by day) d
    ), '[]'::jsonb),
    -- Los productos a la venta y los que tienen reservas o salidas en el rango.
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'color', p.color,
        'revenue_cents', coalesce(r.revenue, 0),
        'capacity', coalesce(o.capacity, 0),
        'booked_seats', coalesce(o.seats, 0)
      ) order by p.name)
      from public.products p
      left join (select product_id, sum(total_cents) as revenue from bk group by product_id) r on r.product_id = p.id
      left join (select product_id, sum(capacity) as capacity, sum(booked_seats) as seats from ss group by product_id) o
        on o.product_id = p.id
      where p.active or r.product_id is not null or o.product_id is not null
    ), '[]'::jsonb),
    'channels', coalesce((
      select jsonb_agg(jsonb_build_object('channel', c.channel, 'revenue_cents', c.revenue) order by c.channel)
      from (select channel, sum(total_cents) as revenue from bk group by channel) c
    ), '[]'::jsonb),
    'languages', coalesce((
      select jsonb_agg(jsonb_build_object('language', g.language, 'pax', g.pax) order by g.language)
      from (select language, sum(pax) as pax from bk group by language) g
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
