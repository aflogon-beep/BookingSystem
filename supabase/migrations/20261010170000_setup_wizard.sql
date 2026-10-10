-- Tarea 3.6: asistente de configuración inicial.

-- Cuándo se terminó el asistente. Mientras sea null, Hoy le propone el asistente al admin.
alter table public.settings add column setup_done_at timestamptz;

comment on column public.settings.setup_done_at is
  'Cuándo se terminó el asistente de configuración inicial. null: Hoy lo propone a los admin.';

-- Como el resto de columnas editables: solo un admin puede cambiar la fila (settings_update_admin).
grant update (setup_done_at) on table public.settings to authenticated;

-- Un negocio que ya tiene productos ya está configurado: no se le propone.
update public.settings set setup_done_at = now() where exists (select 1 from public.products);

-- Guarda el asistente en una sola transacción: datos del negocio, tipos de entrada nuevos,
-- equipo (guías y vehículos) y el primer tour con sus precios y horario (save_product).
-- Añade a lo que ya hay: no borra nada (los ajustes sí se reescriben con lo del asistente).
-- Solo admin (los ajustes y los tipos de entrada son suyos).
-- p:
--   settings      {business_name, currency, languages}
--   ticket_types  [{key, name, note, takes_seat, sort}]  tipos nuevos; key solo sirve para los precios
--   resources     [{name, type, seats, languages}]
--   product       p_product de save_product (con slug y needs)
--   prices        [{ticket, price_cents}]  ticket: key de un tipo nuevo o id de uno que ya existía
--   rules         p_rules de save_product
-- Devuelve el id del producto creado. Las salidas las genera después la app (generate_sessions).
create function public.complete_setup(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_keys jsonb := '{}'::jsonb;
  v_ticket jsonb;
  v_id uuid;
  v_prices jsonb;
  v_saved jsonb;
begin
  if not public.is_admin() then
    raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
  end if;

  -- Fila de ajustes bloqueada: no se quita un idioma que ya usan los horarios (como en Ajustes).
  perform 1 from public.settings where id = 1 for update;
  if exists (
    select 1 from public.schedule_rules
    where not (language = any (array(select jsonb_array_elements_text(p->'settings'->'languages'))))
  ) then
    raise exception 'Idioma en uso' using errcode = 'check_violation';
  end if;

  update public.settings
  set business_name = p->'settings'->>'business_name',
      currency = p->'settings'->>'currency',
      languages = array(select jsonb_array_elements_text(p->'settings'->'languages')),
      setup_done_at = now()
  where id = 1;

  for v_ticket in select value from jsonb_array_elements(coalesce(p->'ticket_types', '[]'::jsonb)) loop
    insert into public.ticket_types (name, note, takes_seat, sort)
    values (v_ticket->>'name', v_ticket->>'note', (v_ticket->>'takes_seat')::boolean, (v_ticket->>'sort')::integer)
    returning id into v_id;
    v_keys := v_keys || jsonb_build_object(v_ticket->>'key', v_id);
  end loop;

  insert into public.resources (name, type, seats, languages)
  select r->>'name', r->>'type', (r->>'seats')::integer, array(select jsonb_array_elements_text(r->'languages'))
  from jsonb_array_elements(coalesce(p->'resources', '[]'::jsonb)) as r;

  select coalesce(jsonb_agg(jsonb_build_object(
    'ticket_type_id', coalesce(v_keys->>(x->>'ticket'), x->>'ticket'),
    'price_cents', (x->>'price_cents')::integer
  )), '[]'::jsonb)
  into v_prices
  from jsonb_array_elements(coalesce(p->'prices', '[]'::jsonb)) as x;

  v_saved := public.save_product(p->'product', v_prices, coalesce(p->'rules', '[]'::jsonb));
  return (v_saved->>'id')::uuid;
end;
$$;

revoke all on function public.complete_setup(jsonb) from public, anon;
grant execute on function public.complete_setup(jsonb) to authenticated;
