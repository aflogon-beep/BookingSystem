-- Cambio de datos pedido por Alberto (2026-11-09): todo texto «Papá y Mamá» pasa a «Papá y Julia».
-- No aparece en el código, así que se busca en los datos: todas las columnas de texto, json y
-- listas de texto de las tablas de public, y los metadatos de los usuarios del equipo (auth.users).
-- Sin distinguir mayúsculas ni tildes («Papa y mama» también cuenta). Cada cambio deja un aviso
-- (NOTICE) con la tabla, la columna y las filas tocadas, visible en el log de la Action.
-- No toca el esquema; si no hay coincidencias no cambia nada.
do $$
declare
  v_pattern constant text := 'pap[aáÁ] y mam[aáÁ]';
  v_replacement constant text := 'Papá y Julia';
  v_col record;
  v_rows bigint;
  v_total bigint := 0;
begin
  for v_col in
    select c.relname as table_name, a.attname as column_name, format_type(a.atttypid, a.atttypmod) as type_name
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and a.attnum > 0
      and not a.attisdropped
      and a.attgenerated = ''
      and a.atttypid in (
        'text'::regtype, 'varchar'::regtype, 'json'::regtype, 'jsonb'::regtype,
        'text[]'::regtype, 'varchar[]'::regtype
      )
    order by c.relname, a.attnum
  loop
    execute format(
      'update public.%1$I set %2$I = regexp_replace(%2$I::text, $1, $2, ''gi'')::%3$s where %2$I::text ~* $1',
      v_col.table_name, v_col.column_name, v_col.type_name
    ) using v_pattern, v_replacement;
    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      raise notice 'Papá y Julia: % fila(s) en %.%', v_rows, v_col.table_name, v_col.column_name;
      v_total := v_total + v_rows;
    end if;
  end loop;

  update auth.users
  set raw_user_meta_data = regexp_replace(raw_user_meta_data::text, v_pattern, v_replacement, 'gi')::jsonb
  where raw_user_meta_data::text ~* v_pattern;
  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    raise notice 'Papá y Julia: % usuario(s) en auth.users', v_rows;
    v_total := v_total + v_rows;
  end if;

  raise notice 'Papá y Julia: % cambio(s) en total', v_total;
end;
$$;
