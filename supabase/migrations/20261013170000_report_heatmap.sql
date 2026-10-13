-- Mapa de calor de Informes: ocupación por día de la semana y hora de salida (hora de Canarias).
-- Mismas reglas que report_summary: solo admin, salidas no canceladas del rango y plazas de las
-- reservas confirmadas (sin bloqueos web a medio pagar).
create function public.report_heatmap(p_from date, p_to date)
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
begin
  if not (select public.is_admin()) then
    raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 92 then
    raise exception 'Rango no válido' using errcode = 'invalid_parameter_value';
  end if;
  v_from := p_from::timestamp at time zone v_tz;
  v_to := (p_to + 1)::timestamp at time zone v_tz;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'weekday', h.weekday,
      'time', h.time,
      'sessions', h.sessions,
      'capacity', h.capacity,
      'booked_seats', h.booked_seats
    ) order by h.weekday, h.time)
    from (
      select
        extract(isodow from s.starts_at at time zone v_tz)::integer as weekday,
        to_char(s.starts_at at time zone v_tz, 'HH24:MI') as time,
        count(*)::integer as sessions,
        sum(s.capacity)::integer as capacity,
        sum(coalesce((
          select sum(l.qty)
          from public.bookings b
          join public.booking_lines l on l.booking_id = b.id
          where b.session_id = s.id and b.status = 'confirmed' and l.takes_seat
        ), 0))::integer as booked_seats
      from public.sessions s
      where s.status <> 'cancelled'
        and s.starts_at >= v_from
        and s.starts_at < v_to
      group by 1, 2
    ) h
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.report_heatmap(date, date) from public, anon;
grant execute on function public.report_heatmap(date, date) to authenticated, service_role;
