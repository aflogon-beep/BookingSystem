-- Tarea 3.6: avisos «Sin equipo».

-- Equipo que le falta a cada salida según lo que necesita su producto (product_needs) y lo que
-- tiene asignado (session_resources), por tipo. Misma regla que session_missing_resources y que
-- missingResources en lib/domain/assignment.ts. Calendario, Hoy y Avisos filtran missing > 0.
-- security_invoker: RLS de cada tabla decide quién la ve (solo el equipo).
create view public.session_staffing with (security_invoker = true) as
select
  s.id as session_id,
  s.product_id,
  s.starts_at,
  greatest(coalesce(n.guide, 0) - coalesce(a.guide, 0), 0)::integer as missing_guides,
  greatest(coalesce(n.vehicle, 0) - coalesce(a.vehicle, 0), 0)::integer as missing_vehicles,
  greatest(coalesce(n.equipment, 0) - coalesce(a.equipment, 0), 0)::integer as missing_equipment,
  (greatest(coalesce(n.guide, 0) - coalesce(a.guide, 0), 0)
    + greatest(coalesce(n.vehicle, 0) - coalesce(a.vehicle, 0), 0)
    + greatest(coalesce(n.equipment, 0) - coalesce(a.equipment, 0), 0))::integer as missing
from public.sessions s
left join lateral (
  select
    sum(pn.qty) filter (where pn.resource_type = 'guide') as guide,
    sum(pn.qty) filter (where pn.resource_type = 'vehicle') as vehicle,
    sum(pn.qty) filter (where pn.resource_type = 'equipment') as equipment
  from public.product_needs pn
  where pn.product_id = s.product_id
) n on true
left join lateral (
  select
    count(*) filter (where r.type = 'guide') as guide,
    count(*) filter (where r.type = 'vehicle') as vehicle,
    count(*) filter (where r.type = 'equipment') as equipment
  from public.session_resources sr
  join public.resources r on r.id = sr.resource_id
  where sr.session_id = s.id
) a on true;

revoke all on table public.session_staffing from anon, authenticated;
grant select on table public.session_staffing to authenticated;
