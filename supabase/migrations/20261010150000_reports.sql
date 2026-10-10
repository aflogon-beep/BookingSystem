-- Tarea 3.5: Informes.

-- Resumen de un rango de días (en la hora del negocio, Atlantic/Canary) para la pantalla Informes:
-- reservas confirmadas por día de salida, producto, canal e idioma, y aforo y plazas ocupadas de
-- las salidas no canceladas. Se agrega en la BD para no traer miles de filas a la app.
-- security invoker: RLS de cada tabla decide (solo el equipo ve reservas y salidas).
create function public.report_summary(p_from date, p_to date)
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
  if not (select public.is_staff()) then
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
  ss as (
    select a.product_id, a.capacity, a.booked_seats
    from public.session_availability a
    join public.sessions s on s.id = a.session_id
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

revoke all on function public.report_summary(date, date) from public, anon;
grant execute on function public.report_summary(date, date) to authenticated, service_role;
