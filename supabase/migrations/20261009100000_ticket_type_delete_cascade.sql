-- Al borrar un tipo de entrada en Ajustes, deja de venderse en todos los productos (como en el
-- prototipo): sus precios se borran en cascada. Cuando existan reservas (tarea 1.6), sus líneas
-- referenciarán el tipo con «on delete restrict» y la BD impedirá borrar uno ya vendido.

alter table public.product_prices
  drop constraint product_prices_ticket_type_id_fkey,
  add constraint product_prices_ticket_type_id_fkey
    foreign key (ticket_type_id) references public.ticket_types (id) on delete cascade;
