-- Tarea 3.3: «Asignar pendientes» en Equipo · Dónde están. Rellena los huecos de las salidas de un
-- día que tienen reservas y les falta equipo, sin tocar lo ya asignado.

-- Rellena los huecos de equipo de una salida sin quitar nada (la lógica de elección de la 3.2).
-- Interna: quien la llama ya tiene la fila de la salida bloqueada y el cerrojo de asignación.
create function public.fill_session_resources(p_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions%rowtype;
  v_period tstzrange;
  v_need record;
  v_have integer;
  v_resource uuid;
  v_missing integer := 0;
begin
  select * into v_session from public.sessions where id = p_session_id;
  if not found or v_session.status = 'cancelled' then
    return 0;
  end if;
  v_period := tstzrange(v_session.starts_at, v_session.ends_at, '[)');

  for v_need in
    select resource_type, qty
    from public.product_needs
    where product_id = v_session.product_id
    order by array_position(array['guide', 'vehicle', 'equipment'], resource_type)
  loop
    select count(*) into v_have
    from public.session_resources sr
    join public.resources r on r.id = sr.resource_id
    where sr.session_id = v_session.id and r.type = v_need.resource_type;

    for i in 1 .. greatest(v_need.qty - v_have, 0) loop
      select r.id into v_resource
      from public.resources r
      where r.type = v_need.resource_type
        and (v_need.resource_type <> 'guide' or v_session.language = any (r.languages))
        -- También excluye los ya asignados a esta salida (su periodo se solapa consigo mismo).
        and not exists (
          select 1 from public.session_resources sr
          where sr.resource_id = r.id and sr.period && v_period
        )
      order by
        case when v_need.resource_type = 'vehicle' then (r.seats < v_session.capacity)::integer else 0 end,
        case
          when v_need.resource_type <> 'vehicle' then 0
          when r.seats >= v_session.capacity then r.seats
          else -r.seats
        end,
        r.created_at,
        r.id
      limit 1;

      if v_resource is null then
        v_missing := v_missing + 1;
      else
        begin
          insert into public.session_resources (session_id, resource_id) values (v_session.id, v_resource);
        exception when exclusion_violation then
          v_missing := v_missing + 1;
        end;
      end if;
    end loop;
  end loop;

  return v_missing;
end;
$$;

revoke all on function public.fill_session_resources(uuid) from public, anon, authenticated;

-- Misma función de la 3.2, ahora con la elección en fill_session_resources.
create or replace function public.assign_session_resources(p_session_id uuid, p_replace boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions%rowtype;
begin
  select * into v_session from public.sessions where id = p_session_id for update;
  if not found or v_session.status = 'cancelled' then
    return 0;
  end if;
  -- Lo habitual (reservas después de la primera): ya tiene equipo y no hace falta el cerrojo.
  if not p_replace and exists (select 1 from public.session_resources where session_id = p_session_id) then
    return public.session_missing_resources(p_session_id);
  end if;

  perform pg_advisory_xact_lock(hashtext('public.assign_session_resources'));
  if p_replace then
    delete from public.session_resources where session_id = p_session_id;
  end if;
  return public.fill_session_resources(p_session_id);
end;
$$;

-- «Asignar pendientes»: salidas no canceladas que empiezan en [p_from, p_to) (un día del panel),
-- con alguna reserva confirmada y equipo incompleto. Rellena sus huecos en orden de hora.
-- Devuelve {"sessions": salidas que tenían huecos, "missing": recursos que siguen faltando}.
create function public.sessions_assign_pending(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_id uuid;
  v_sessions integer := 0;
  v_missing integer := 0;
begin
  if not public.is_staff() then
    raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
  end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '2 days' then
    raise exception 'Rango no válido' using errcode = 'invalid_parameter_value';
  end if;

  -- Mismo orden de bloqueos que el resto: filas de las salidas (por id) y después el cerrojo.
  perform 1
  from public.sessions s
  where s.starts_at >= p_from and s.starts_at < p_to and s.status <> 'cancelled'
  order by s.id
  for update;
  perform pg_advisory_xact_lock(hashtext('public.assign_session_resources'));

  select coalesce(array_agg(s.id order by s.starts_at, s.id), '{}') into v_ids
  from public.sessions s
  where s.starts_at >= p_from and s.starts_at < p_to and s.status <> 'cancelled'
    and exists (select 1 from public.bookings b where b.session_id = s.id and b.status = 'confirmed')
    and public.session_missing_resources(s.id) > 0;

  foreach v_id in array v_ids loop
    v_sessions := v_sessions + 1;
    v_missing := v_missing + public.fill_session_resources(v_id);
  end loop;
  return jsonb_build_object('sessions', v_sessions, 'missing', v_missing);
end;
$$;

revoke all on function public.sessions_assign_pending(timestamptz, timestamptz) from public, anon;
grant execute on function public.sessions_assign_pending(timestamptz, timestamptz) to authenticated;
