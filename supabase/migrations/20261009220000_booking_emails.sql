-- Emails de reserva (tarea 2.3). La confirmación se envía al crear la reserva; estas marcas
-- evitan mandar dos veces el recordatorio del día antes o el aviso de cancelación. Las pone el
-- servidor con service role justo antes de enviar (el equipo no puede tocarlas: solo tiene
-- update en checked_in, agent, hotel y notes).

alter table public.bookings
  add column reminder_sent_at timestamptz,
  add column cancellation_sent_at timestamptz;

comment on column public.bookings.reminder_sent_at is
  'Cuándo se envió el recordatorio del día antes. Null: aún no.';
comment on column public.bookings.cancellation_sent_at is
  'Cuándo se envió el aviso de cancelación. Null: aún no.';
