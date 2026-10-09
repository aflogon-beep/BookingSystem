import "server-only";

import { addDays } from "date-fns";

import { createClient } from "@/lib/db/server";
import { MOVE_WINDOW_DAYS, moveOptions, seatsOf, type MoveCandidate } from "@/lib/domain/booking-detail";

export type BookingDetail = {
  id: string;
  code: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
  totalCents: number;
  paidCents: number;
  channel: string;
  agent: string;
  hotel: string;
  notes: string;
  checkedIn: boolean;
  customer: { name: string; email: string; phone: string };
  session: { id: string; startsAt: string; language: string; status: string };
  product: { name: string; color: string; pickup: boolean; meetingPoint: string };
  lines: { name: string; qty: number }[];
  seats: number;
  events: { id: string; actor: string; text: string; at: string }[];
  moveOptions: MoveCandidate[];
  cancelHours: number;
};

/** Reserva por código con su historial y las salidas a las que se puede mover. Con la sesión del equipo (RLS). */
export async function loadBookingDetail(code: string, now: Date): Promise<BookingDetail | null> {
  const supabase = await createClient();
  const [{ data: row, error }, { data: settings, error: settingsError }] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        "id, code, status, payment_status, payment_method, total_cents, paid_cents, channel, agent, hotel, notes, checked_in, customers!inner(name, email, phone), sessions!inner(id, starts_at, language, status, product_id, products!inner(name, color, pickup, meeting_point)), booking_lines(qty, takes_seat, ticket_types!inner(name, sort)), booking_events(id, actor, text, created_at)",
      )
      .eq("code", code)
      .maybeSingle(),
    supabase.from("settings").select("cancel_hours").eq("id", 1).single(),
  ]);
  if (error || settingsError) throw new Error("No se pudo cargar la reserva.");
  if (!row) return null;

  const lines = [...row.booking_lines].sort((a, b) => a.ticket_types.sort - b.ticket_types.sort);
  const seats = seatsOf(lines.map((line) => ({ qty: line.qty, takesSeat: line.takes_seat })));
  const session = row.sessions;

  let options: MoveCandidate[] = [];
  if (row.status === "confirmed" && new Date(session.starts_at) > now) {
    const [{ data: sessions, error: sessionsError }, { data: availability, error: availabilityError }] = await Promise.all([
      supabase
        .from("sessions")
        .select("id, starts_at, language, status")
        .eq("product_id", session.product_id)
        .eq("status", "open")
        .gt("starts_at", now.toISOString())
        .lte("starts_at", addDays(now, MOVE_WINDOW_DAYS).toISOString())
        .order("starts_at"),
      supabase
        .from("session_availability")
        .select("session_id, free_seats")
        .eq("product_id", session.product_id)
        .gt("starts_at", now.toISOString())
        .lte("starts_at", addDays(now, MOVE_WINDOW_DAYS).toISOString()),
    ]);
    if (sessionsError || availabilityError) throw new Error("No se pudieron cargar las salidas.");
    const free = new Map(availability.map((item) => [item.session_id, item.free_seats ?? 0]));
    options = moveOptions(
      sessions.map((item) => ({
        id: item.id,
        startsAt: item.starts_at,
        language: item.language,
        status: item.status,
        free: free.get(item.id) ?? 0,
      })),
      session.id,
      seats,
      now,
    );
  }

  return {
    id: row.id,
    code: row.code,
    status: row.status,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
    totalCents: row.total_cents,
    paidCents: row.paid_cents,
    channel: row.channel,
    agent: row.agent,
    hotel: row.hotel,
    notes: row.notes,
    checkedIn: row.checked_in,
    customer: { name: row.customers.name, email: row.customers.email ?? "", phone: row.customers.phone ?? "" },
    session: { id: session.id, startsAt: session.starts_at, language: session.language, status: session.status },
    product: {
      name: session.products.name,
      color: session.products.color,
      pickup: session.products.pickup,
      meetingPoint: session.products.meeting_point,
    },
    lines: lines.map((line) => ({ name: line.ticket_types.name, qty: line.qty })),
    seats,
    events: [...row.booking_events]
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || String(b.id).localeCompare(String(a.id)))
      .map((event) => ({ id: String(event.id), actor: event.actor, text: event.text, at: event.created_at })),
    moveOptions: options,
    cancelHours: settings.cancel_hours,
  };
}
