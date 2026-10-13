-- Borra todas las reservas y clientes de prueba que creó cargar.sql (email @ejemplo.test).
-- Se lanza desde GitHub (Actions > Datos de prueba > Run workflow > borrar). Las líneas e
-- historial se borran en cascada y el equipo de cada salida que quede vacía se libera (trigger
-- bookings_aa_release_resources_delete). No toca ninguna reserva real.

create temp table seed_log (dato text, valor integer) on commit preserve rows;

do $$
declare
  v_bookings integer;
  v_customers integer;
begin
  delete from public.bookings
  where customer_id in (select id from public.customers where email like '%@ejemplo.test');
  get diagnostics v_bookings = row_count;
  delete from public.customers where email like '%@ejemplo.test';
  get diagnostics v_customers = row_count;
  insert into seed_log values ('reservas borradas', v_bookings), ('clientes borrados', v_customers);
end;
$$;

select dato, valor from seed_log;
