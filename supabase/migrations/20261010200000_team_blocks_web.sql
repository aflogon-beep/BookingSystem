-- La web no vende una salida si su equipo está ocupado. Con un solo guía, la primera reserva de
-- una salida se queda con él (bookings_auto_assign) y las salidas que se solapan dejan de
-- venderse en la web hasta que el guía termina la visita. El panel sí puede reservar (el equipo
-- decide, p. ej. con un guía externo) y la salida aparece en avisos como «sin equipo».

-- ¿Puede operar esta salida con el equipo de la empresa? Sí si:
--   * ya tiene reservas activas (el equipo ya está comprometido o el aviso ya existe), o
--   * para cada recurso que pide su producto hay suficientes: los ya asignados a la salida más los
--     libres durante todo su horario (guías: que hablen su idioma). Misma elección que
--     fill_session_resources.
-- Un tipo de recurso sin ninguna ficha dada de alta no bloquea (si no, sin guías creados la web
-- no vendería nada). Salida que no existe: null.
create function public.session_team_free(p_session_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select
    exists (
      select 1 from public.bookings b
      where b.session_id = s.id
        and (b.status = 'confirmed' or (b.status = 'pending' and b.hold_expires_at > now()))
    )
    or not exists (
      select 1
      from public.product_needs n
      where n.product_id = s.product_id
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
    )
  from public.sessions s
  where s.id = p_session_id;
$$;

revoke all on function public.session_team_free(uuid) from public, anon;
grant execute on function public.session_team_free(uuid) to authenticated, service_role;

-- Lo mismo por salida, para listar las que vende la web. security_invoker: RLS decide.
create view public.session_team_status with (security_invoker = true) as
select
  s.id as session_id,
  s.product_id,
  s.starts_at,
  coalesce(public.session_team_free(s.id), false) as team_free
from public.sessions s;

revoke all on table public.session_team_status from anon, authenticated;
grant select on table public.session_team_status to authenticated;

-- Al cancelar, mover o caducar la última reserva activa de una salida, su equipo queda libre para
-- las salidas que se solapan. Si aún le quedan reservas, no se toca. Los triggers se llaman
-- «bookings_aa_…» para ir antes que bookings_auto_assign (Postgres los ejecuta por orden
-- alfabético): al mover una reserva a otra salida que se solapa, el guía se libera antes de
-- asignarlo en la nueva.
create function public.bookings_release_resources()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.bookings b
    where b.session_id = old.session_id
      and (b.status = 'confirmed' or (b.status = 'pending' and b.hold_expires_at > now()))
  ) then
    delete from public.session_resources where session_id = old.session_id;
  end if;
  return null;
end;
$$;

revoke all on function public.bookings_release_resources() from public, anon, authenticated;

create trigger bookings_aa_release_resources_update
  after update of status, session_id on public.bookings
  for each row
  when (old.status in ('confirmed', 'pending')
    and (new.status not in ('confirmed', 'pending') or new.session_id <> old.session_id))
  execute function public.bookings_release_resources();

create trigger bookings_aa_release_resources_delete
  after delete on public.bookings
  for each row
  when (old.status in ('confirmed', 'pending'))
  execute function public.bookings_release_resources();

-- create_booking_hold (versión de 20261009200000) con la comprobación de equipo en la web.
create or replace function public.create_booking_hold(
  p_session_id uuid,
  p_lines jsonb,
  p_customer jsonb,
  p_booking jsonb default '{}'::jsonb,
  p_hold_minutes integer default 35
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_channel text := coalesce(p_booking->>'channel', '');
  -- Web sin pasarela: la reserva queda confirmada y se paga el día del tour.
  v_pay_on_site boolean := coalesce(p_booking->>'channel', '') = 'web' and coalesce(p_booking->>'payment', '') = 'on_site';
  v_method text := nullif(p_booking->>'payment_method', '');
  v_name text := btrim(coalesce(p_customer->>'name', ''));
  v_email text := lower(nullif(btrim(coalesce(p_customer->>'email', '')), ''));
  v_phone text := nullif(btrim(coalesce(p_customer->>'phone', '')), '');
  v_session public.sessions%rowtype;
  v_product_active boolean;
  v_cutoff_hours integer;
  v_line_count integer;
  v_distinct integer;
  v_priced integer;
  v_qty_ok boolean;
  v_seats integer;
  v_total bigint;
  v_occupied integer;
  v_customer_id uuid;
  v_booking_id uuid;
  v_code text;
  v_status text;
  v_payment_status text;
  v_hold timestamptz;
  v_attempt integer := 0;
begin
  if v_channel not in ('web', 'phone', 'desk', 'agency') then
    raise exception 'Canal no válido' using errcode = 'invalid_parameter_value';
  end if;
  if v_channel = 'web' then
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
    end if;
  elsif not public.is_staff() then
    raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
  end if;
  if v_channel = 'web' then
    if p_hold_minutes is null or p_hold_minutes not between 1 and 120 then
      raise exception 'Bloqueo no válido' using errcode = 'invalid_parameter_value';
    end if;
    if v_method is not null and v_method <> 'card_online' then
      raise exception 'Método de pago no válido' using errcode = 'invalid_parameter_value';
    end if;
    v_method := case when v_pay_on_site then null else 'card_online' end;
  elsif v_method is not null and v_method not in ('card_terminal', 'cash', 'payment_link', 'invoice') then
    raise exception 'Método de pago no válido' using errcode = 'invalid_parameter_value';
  end if;
  if char_length(v_name) not between 1 and 120 then
    raise exception 'Falta el nombre del cliente' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 20 then
    raise exception 'Entradas no válidas' using errcode = 'RB003';
  end if;

  perform pg_advisory_xact_lock_shared(hashtext('public.generate_sessions'));

  select * into v_session from public.sessions where id = p_session_id for update;
  if not found then
    raise exception 'Salida no encontrada' using errcode = 'no_data_found';
  end if;
  if v_session.status <> 'open' or v_session.starts_at <= now() then
    raise exception 'La salida no admite reservas' using errcode = 'RB002';
  end if;
  if v_channel = 'web' then
    select active into v_product_active from public.products where id = v_session.product_id;
    select cutoff_hours into v_cutoff_hours from public.settings where id = 1;
    if not coalesce(v_product_active, false)
      or v_session.starts_at < now() + make_interval(hours => coalesce(v_cutoff_hours, 0)) then
      raise exception 'La salida no admite reservas' using errcode = 'RB002';
    end if;
  end if;

  begin
  select
    count(*),
    count(distinct r.ticket_type_id),
    count(pp.ticket_type_id),
    bool_and(coalesce(r.qty between 1 and 100, false)),
    coalesce(sum(r.qty) filter (where t.takes_seat), 0),
    coalesce(sum(r.qty::bigint * pp.price_cents), 0)
  into v_line_count, v_distinct, v_priced, v_qty_ok, v_seats, v_total
  from (
    select (line->>'ticket_type_id')::uuid as ticket_type_id, (line->>'qty')::integer as qty
    from jsonb_array_elements(p_lines) as line
  ) r
  left join public.ticket_types t on t.id = r.ticket_type_id
  left join public.product_prices pp on pp.product_id = v_session.product_id and pp.ticket_type_id = r.ticket_type_id;
  exception when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then
    raise exception 'Entradas no válidas' using errcode = 'RB003';
  end;
  if v_distinct <> v_line_count or v_priced <> v_line_count or not coalesce(v_qty_ok, false) then
    raise exception 'Entradas no válidas' using errcode = 'RB003';
  end if;
  if v_seats = 0 then
    raise exception 'La reserva necesita al menos una entrada con plaza' using errcode = 'RB003';
  end if;
  if v_pay_on_site and v_seats > 10 then
    raise exception 'Demasiadas plazas para una reserva web' using errcode = 'RB008', hint = '10';
  end if;
  if v_total > 2147483647 then
    raise exception 'Importe demasiado alto' using errcode = 'RB003';
  end if;

  v_occupied := public.session_occupied_seats(v_session.id);
  if v_seats > v_session.capacity - v_occupied then
    raise exception 'No quedan plazas suficientes' using
      errcode = 'RB001', hint = greatest(v_session.capacity - v_occupied, 0)::text;
  end if;

  -- Web: la salida necesita su equipo libre (session_team_free). El cerrojo de asignación (después
  -- de la fila de la salida, como en assign_session_resources) hace que, si llegan a la vez
  -- reservas a dos salidas que se solapan y comparten el único guía, solo una se quede con él.
  if v_channel = 'web' then
    perform pg_advisory_xact_lock(hashtext('public.assign_session_resources'));
    if not coalesce(public.session_team_free(v_session.id), false) then
      raise exception 'La salida no tiene equipo libre' using errcode = 'RB002';
    end if;
  end if;

  -- Mismo email y mismo nombre: el mismo cliente. Si no, uno nuevo (una agencia reserva con su
  -- email para clientes distintos; y nadie se une a la ficha de otro solo con su email).
  if v_email is not null then
    select id into v_customer_id
    from public.customers
    where email = v_email and lower(name) = lower(v_name)
    order by created_at
    limit 1;
  end if;
  if v_customer_id is null then
    insert into public.customers (name, email, phone)
    values (v_name, v_email, v_phone)
    returning id into v_customer_id;
  end if;

  if v_channel = 'web' and not v_pay_on_site then
    v_status := 'pending';
    v_payment_status := 'pending';
    v_hold := now() + make_interval(mins => p_hold_minutes);
  else
    v_status := 'confirmed';
    v_payment_status := case v_method
      when 'card_terminal' then 'paid'
      when 'cash' then 'paid'
      when 'invoice' then 'invoice'
      else 'pending'
    end;
  end if;

  loop
    v_attempt := v_attempt + 1;
    -- 6 caracteres de 32 posibles con bytes aleatorios seguros (los 6 primeros de un uuid v4).
    select 'VT' || string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + get_byte(b, i) % 32, 1), '' order by i)
    into v_code
    from (select uuid_send(gen_random_uuid()) as b) as random_bytes, generate_series(0, 5) as i;
    begin
      insert into public.bookings (code, session_id, customer_id, status, payment_status, payment_method, channel,
        agent, hotel, notes, total_cents, paid_cents, hold_expires_at)
      values (v_code, v_session.id, v_customer_id, v_status, v_payment_status, v_method, v_channel,
        case when v_channel = 'agency' then btrim(coalesce(p_booking->>'agent', '')) else '' end,
        btrim(coalesce(p_booking->>'hotel', '')),
        btrim(coalesce(p_booking->>'notes', '')), v_total,
        case when v_payment_status = 'paid' then v_total else 0 end, v_hold)
      returning id into v_booking_id;
      exit;
    exception when unique_violation then
      -- Código repetido (muy raro): se prueba con otro.
      if v_attempt >= 5 then
        raise;
      end if;
    end;
  end loop;

  insert into public.booking_lines (booking_id, ticket_type_id, qty, unit_price_cents, takes_seat)
  select v_booking_id, r.ticket_type_id, r.qty, pp.price_cents, t.takes_seat
  from (
    select (line->>'ticket_type_id')::uuid as ticket_type_id, (line->>'qty')::integer as qty
    from jsonb_array_elements(p_lines) as line
  ) r
  join public.ticket_types t on t.id = r.ticket_type_id
  join public.product_prices pp on pp.product_id = v_session.product_id and pp.ticket_type_id = r.ticket_type_id;

  insert into public.booking_events (booking_id, actor, text)
  values (
    v_booking_id,
    coalesce((select name from public.staff where user_id = auth.uid()), 'Web'),
    case
      when v_pay_on_site then 'Reserva creada · paga allí'
      when v_channel = 'web' then 'Reserva creada, pendiente de pago'
      else 'Reserva creada'
    end
  );

  return jsonb_build_object('id', v_booking_id, 'code', v_code, 'status', v_status, 'payment_status', v_payment_status,
    'total_cents', v_total, 'hold_expires_at', v_hold);
end;
$$;

