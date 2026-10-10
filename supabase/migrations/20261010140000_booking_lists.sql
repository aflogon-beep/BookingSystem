-- Tarea 3.4: listado de reservas (con filtros y CSV) y clientes.

-- Reservas tal y como se listan en el panel: las confirmadas y las canceladas, con salida,
-- producto, cliente, pasajeros y entradas. Igual que el manifiesto, no salen las web con tarjeta
-- que nunca llegaron a confirmarse (bloqueo vigente, caducadas o canceladas sin pagar). Las web
-- de «paga allí» (sin método de pago) sí salen, también si luego se cancelan.
-- security_invoker: RLS de cada tabla decide quién la ve (solo el equipo).
create view public.booking_list with (security_invoker = true) as
select
  b.id,
  b.code,
  b.status,
  b.payment_status,
  b.payment_method,
  b.channel,
  b.agent,
  b.hotel,
  b.total_cents,
  b.paid_cents,
  b.checked_in,
  b.created_at,
  b.session_id,
  s.starts_at,
  s.language,
  s.product_id,
  p.name as product_name,
  p.color as product_color,
  b.customer_id,
  c.name as customer_name,
  c.email as customer_email,
  c.phone as customer_phone,
  coalesce(l.pax, 0)::integer as pax,
  coalesce(l.lines, '[]'::jsonb) as lines,
  -- Búsqueda del listado: nombre, email, teléfono, código, hotel y agencia.
  lower(concat_ws(' ', c.name, c.email, c.phone, b.code, b.hotel, b.agent)) as search_text
from public.bookings b
join public.sessions s on s.id = b.session_id
join public.products p on p.id = s.product_id
join public.customers c on c.id = b.customer_id
left join lateral (
  select
    sum(bl.qty) as pax,
    jsonb_agg(jsonb_build_object('ticketName', t.name, 'qty', bl.qty) order by t.sort, t.name) as lines
  from public.booking_lines bl
  join public.ticket_types t on t.id = bl.ticket_type_id
  where bl.booking_id = b.id
) l on true
where b.status in ('confirmed', 'cancelled')
  and not (b.channel = 'web' and b.status = 'cancelled' and b.payment_status = 'pending'
           and b.payment_method is not distinct from 'card_online');

revoke all on table public.booking_list from anon, authenticated;
grant select on table public.booking_list to authenticated;

-- Clientes con al menos una reserva del listado: reservas, pasajeros y gasto (sin canceladas) y
-- su última salida.
create view public.customer_list with (security_invoker = true) as
select
  c.id,
  c.name,
  c.email,
  c.phone,
  count(b.id)::integer as bookings,
  coalesce(sum(b.pax) filter (where b.status <> 'cancelled'), 0)::integer as pax,
  coalesce(sum(b.total_cents) filter (where b.status <> 'cancelled'), 0)::integer as spent_cents,
  max(b.starts_at) as last_starts_at,
  lower(concat_ws(' ', c.name, c.email, c.phone)) as search_text
from public.customers c
join public.booking_list b on b.customer_id = c.id
group by c.id;

revoke all on table public.customer_list from anon, authenticated;
grant select on table public.customer_list to authenticated;
