-- Rapidez del panel: los totales de la cabecera de Reservas (reservas, pasajeros e importe) se
-- calculaban leyendo todas las reservas filtradas en tandas de 1000 (con un año de datos, ~18
-- peticiones seguidas). Con los agregados de PostgREST (count(), sum()) los suma la base de datos
-- en una sola petición. Supabase los trae desactivados; se activan para la API.
-- No cambia permisos: los agregados solo ven las filas que RLS ya deja ver (solo el equipo).
alter role authenticator set pgrst.db_aggregates_enabled = 'true';
notify pgrst, 'reload config';
