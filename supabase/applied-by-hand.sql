-- Migraciones que se aplicaron a mano en el SQL Editor de Supabase cloud antes de que el CI
-- las aplicara solo (tarea 4.2). Su historial remoto está vacío, así que `supabase db push`
-- intentaría ejecutarlas otra vez. Esta consulta devuelve las versiones cuyo último objeto ya
-- existe en la base de datos; el workflow de migraciones las marca como aplicadas
-- (`supabase migration repair --status applied`) antes de hacer push.
-- Solo lectura. No añadas migraciones nuevas aquí: las nuevas las aplica el CI.
select 'APPLIED[' || coalesce(string_agg(version, ' ' order by version), '') || ']' as applied
from (
  values
    ('20261009081327', exists (
      select 1 from pg_trigger
      where tgname = 'staff_keep_one_admin' and tgrelid = to_regclass('public.staff'))),
    ('20261009090000', exists (
      select 1 from pg_policies
      where schemaname = 'public' and policyname = 'schedule_rules_delete_staff')),
    ('20261009100000', exists (
      select 1 from pg_constraint
      where conname = 'product_prices_ticket_type_id_fkey' and confdeltype = 'c')),
    ('20261009120000', exists (
      select 1 from pg_policies
      where schemaname = 'storage' and policyname = 'product_photos_select_staff')),
    ('20261009140000', to_regprocedure('public.generate_sessions(date, date, uuid)') is not null),
    ('20261009160000',
      to_regprocedure('public.create_booking_hold(uuid, jsonb, jsonb, jsonb, integer)') is not null
      and coalesce(pg_get_functiondef(to_regprocedure('public.generate_sessions(date, date, uuid)')) like '%public.bookings%', false))
) as checks (version, applied)
where applied;
