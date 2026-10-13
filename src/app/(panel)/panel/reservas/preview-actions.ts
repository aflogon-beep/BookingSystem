"use server";

import { requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/db/server";
import { BOOKING_CODE, latestEvents } from "@/lib/domain/booking-preview";

export type BookingPreview = {
  id: string;
  code: string;
  status: string;
  paymentStatus: string;
  totalCents: number;
  paidCents: number;
  channel: string;
  agent: string;
  hotel: string;
  notes: string;
  checkedIn: boolean;
  arrivedPax: number | null;
  noShow: boolean;
  pax: number;
  customer: { name: string; email: string; phone: string };
  session: { id: string; startsAt: string; language: string };
  product: {
    name: string;
    color: string;
    pickup: boolean;
    meetingPoint: string;
  };
  lines: { name: string; qty: number; unitCents: number }[];
  events: { id: string; actor: string; text: string; at: string }[];
};

/** Lo justo de una reserva para la vista previa del listado. Con la sesión del equipo (RLS). */
export async function loadBookingPreview(code: string): Promise<BookingPreview | null> {
  await requireAccess("reservas");
  if (typeof code !== "string" || !BOOKING_CODE.test(code)) return null;

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("bookings")
    .select(
      "id, code, status, payment_status, total_cents, paid_cents, channel, agent, hotel, notes, checked_in, arrived_pax, no_show, customers!inner(name, email, phone), sessions!inner(id, starts_at, language, products!inner(name, color, pickup, meeting_point)), booking_lines(qty, unit_price_cents, ticket_types!inner(name, sort)), booking_events(id, actor, text, created_at)",
    )
    .eq("code", code)
    .maybeSingle();
  if (error) throw new Error("No se pudo cargar la reserva.");
  if (!row) return null;

  const lines = [...row.booking_lines].sort((a, b) => a.ticket_types.sort - b.ticket_types.sort);
  const session = row.sessions;
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    paymentStatus: row.payment_status,
    totalCents: row.total_cents,
    paidCents: row.paid_cents,
    channel: row.channel,
    agent: row.agent,
    hotel: row.hotel,
    notes: row.notes,
    checkedIn: row.checked_in,
    arrivedPax: row.arrived_pax,
    noShow: row.no_show,
    pax: lines.reduce((sum, line) => sum + line.qty, 0),
    customer: {
      name: row.customers.name,
      email: row.customers.email ?? "",
      phone: row.customers.phone ?? "",
    },
    session: {
      id: session.id,
      startsAt: session.starts_at,
      language: session.language,
    },
    product: {
      name: session.products.name,
      color: session.products.color,
      pickup: session.products.pickup,
      meetingPoint: session.products.meeting_point,
    },
    lines: lines.map((line) => ({
      name: line.ticket_types.name,
      qty: line.qty,
      unitCents: line.unit_price_cents,
    })),
    events: latestEvents(
      row.booking_events.map((event) => ({
        id: String(event.id),
        actor: event.actor,
        text: event.text,
        at: event.created_at,
      })),
    ),
  };
}
