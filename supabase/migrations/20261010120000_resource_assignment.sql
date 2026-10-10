-- Tarea 3.2: asignación de recursos a las salidas, automática (con la primera reserva o con el
-- botón «Auto» del manifiesto) y manual (desde el manifiesto).

-- Asignación automática ----------------------------------------------------------------------

-- Rellena los huecos de equipo de una salida según lo que necesita su producto (product_needs):
--   * Guías: solo los que guían en el idioma de la salida.
--   * Vehículos: el más pequeño con asientos para el aforo de la salida; si ninguno llega, el
--     más grande libre.
--   * Material: el primero libre.
--   * Nunca un recurso ocupado en otra salida que se solape. A igualdad, el más antiguo.
-- p_replace: true quita antes lo asignado (botón «Auto»); false solo asigna si la salida no tiene
-- nada (primera reserva), como en el prototipo. Las salidas canceladas no se tocan.
-- Devuelve cuántos recursos faltan por asignar. Un cerrojo evita que dos asignaciones a la vez
-- elijan el mismo recurso; si aun así choca con una asignación manual, ese hueco queda sin
-- asignar (nunca falla la reserva que la provocó). Orden de bloqueos, igual en todas las
-- funciones de asignación: primero la fila de la salida (la reserva ya la tiene) y después el
-- cerrojo; al revés, una reserva y «Auto» en la misma salida se bloquearían mutuamente.
-- Interna: la llaman session_auto_assign y el trigger de reservas.
create function public.assign_session_resources(p_session_id uuid, p_replace boolean)
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
  select * into v_session from public.sessions where id = p_session_id for update;
  if not found or v_session.status = 'cancelled' then
    return 0;
  end if;
  -- Lo habitual (reservas después de la primera): ya tiene equipo y no hace falta el cerrojo.
  if not p_replace and exists (select 1 from public.session_resources where session_id = p_session_id) then
    return public.session_missing_resources(p_session_id);
  end if;

  perform pg_advisory_xact_lock(hashtext('public.assign_session_resources'));
  v_period := tstzrange(v_session.starts_at, v_session.ends_at, '[)');
  if p_replace then
    delete from public.session_resources where session_id = p_session_id;
  end if;

  for v_need in
    select resource_type, qty
    from public.product_needs
    where product_id = v_session.product_id
    order by array_position(array['guide', 'vehicle', 'equipment'], resource_type)
  loop
    select count(*) into v_have
    from public.session_resources sr
    join public.resources r on r.id = sr.resource_id
    where sr.session_id = p_session_id and r.type = v_need.resource_type;

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
          insert into public.session_resources (session_id, resource_id) values (p_session_id, v_resource);
        exception when exclusion_violation then
          v_missing := v_missing + 1;
        end;
      end if;
    end loop;
  end loop;

  return v_missing;
end;
$$;

revoke all on function public.assign_session_resources(uuid, boolean) from public, anon, authenticated;

-- Recursos que faltan en una salida: lo que pide el producto menos lo asignado, tipo a tipo.
create function public.session_missing_resources(p_session_id uuid)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(greatest(n.qty - coalesce(a.assigned, 0), 0)), 0)::integer
  from public.sessions s
  join public.product_needs n on n.product_id = s.product_id
  left join lateral (
    select count(*) as assigned
    from public.session_resources sr
    join public.resources r on r.id = sr.resource_id
    where sr.session_id = s.id and r.type = n.resource_type
  ) a on true
  where s.id = p_session_id;
$$;

revoke all on function public.session_missing_resources(uuid) from public, anon;
grant execute on function public.session_missing_resources(uuid) to authenticated, service_role;

-- Botón «Auto» del manifiesto: vuelve a asignar todo el equipo de la salida. Solo el equipo.
create function public.session_auto_assign(p_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.sessions where id = p_session_id) then
    raise exception 'Salida no encontrada' using errcode = 'no_data_found';
  end if;
  if exists (select 1 from public.sessions where id = p_session_id and status = 'cancelled') then
    raise exception 'La salida está cancelada' using errcode = 'check_violation';
  end if;
  return public.assign_session_resources(p_session_id, true);
end;
$$;

revoke all on function public.session_auto_assign(uuid) from public, anon;
grant execute on function public.session_auto_assign(uuid) to authenticated;

-- Con cada reserva confirmada (nueva, confirmada después o movida a otra salida), si la salida
-- aún no tiene equipo, se asigna solo.
create function public.bookings_auto_assign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assign_session_resources(new.session_id, false);
  return null;
end;
$$;

revoke all on function public.bookings_auto_assign() from public, anon, authenticated;

create trigger bookings_auto_assign
  after insert or update of status, session_id on public.bookings
  for each row
  when (new.status = 'confirmed')
  execute function public.bookings_auto_assign();

-- Asignación manual ---------------------------------------------------------------------------

-- Sustituye el equipo de una salida por el elegido en el manifiesto, en una sola transacción.
-- Un recurso ocupado en otra salida a la vez falla con 23P01 (restricción de exclusión) y una
-- salida cancelada con 23514. security invoker: RLS decide (solo el equipo). Guarda el orden
-- elegido (Guía 1, Guía 2…) en created_at.
create function public.session_set_resources(p_session_id uuid, p_resource_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
  end if;
  perform 1 from public.sessions where id = p_session_id for update;
  if not found then
    raise exception 'Salida no encontrada' using errcode = 'no_data_found';
  end if;
  perform pg_advisory_xact_lock(hashtext('public.assign_session_resources'));
  delete from public.session_resources where session_id = p_session_id;
  insert into public.session_resources (session_id, resource_id, created_at)
  select p_session_id, ids.resource_id, now() + make_interval(secs => min(ids.position) / 1000000.0)
  from unnest(coalesce(p_resource_ids, '{}')) with ordinality as ids (resource_id, position)
  group by ids.resource_id;
end;
$$;

revoke all on function public.session_set_resources(uuid, uuid[]) from public, anon;
grant execute on function public.session_set_resources(uuid, uuid[]) to authenticated;
