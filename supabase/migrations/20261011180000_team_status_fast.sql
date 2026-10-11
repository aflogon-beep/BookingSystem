-- Rapidez del panel: session_team_status calculaba, salida por salida, una llamada a
-- session_blocking_need(). Postgres no puede «abrir» una función con SET search_path dentro de la
-- consulta, así que cada salida repetía la planificación y las comprobaciones de RLS: un mes del
-- calendario (unas 750 salidas) tardaba ~0,5 s solo en esta vista.
--
-- Ahora la vista lleva la misma regla como subconsulta (LATERAL): una sola consulta para todo el
-- rango, con el filtro de fechas aplicado antes. Mismo resultado, ~15 veces más rápido.
-- session_blocking_need() lee de la vista, así la regla sigue escrita en un único sitio. La regla
-- está explicada en 20261010200000_required_resources.sql.

create or replace view public.session_team_status with (security_invoker = true) as
select
  s.id as session_id,
  s.product_id,
  s.starts_at,
  bn.resource_type is null as team_free,
  bn.resource_type as blocking_need
from public.sessions s
left join lateral (
  select n.resource_type
  from public.product_needs n
  where n.product_id = s.product_id
    and n.required
    and not exists (
      select 1 from public.bookings b
      where b.session_id = s.id
        and (b.status = 'confirmed' or (b.status = 'pending' and b.hold_expires_at > now()))
    )
    and exists (select 1 from public.resources any_r where any_r.type = n.resource_type)
    and n.qty > (
      select count(*)
      from public.resources r
      where r.type = n.resource_type
        and (
          exists (select 1 from public.session_resources own where own.session_id = s.id and own.resource_id = r.id)
          or (
            (n.resource_type <> 'guide' or s.language = any (r.languages))
            and not exists (
              select 1 from public.session_resources busy
              where busy.resource_id = r.id
                and busy.period && tstzrange(s.starts_at, s.ends_at, '[)')
            )
          )
        )
    )
  order by array_position(array['guide', 'vehicle', 'equipment'], n.resource_type)
  limit 1
) bn on true;

-- Recurso obligatorio que impide reservar esta salida (ver session_team_status), o null.
-- La usa create_booking_hold.
create or replace function public.session_blocking_need(p_session_id uuid)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select st.blocking_need from public.session_team_status st where st.session_id = p_session_id;
$$;
