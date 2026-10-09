import "server-only";

import type { ActivityItem, TodaySession } from "@/components/hoy/types";
import { createClient } from "@/lib/db/server";
import { rangeForDays, toBusinessDateTime } from "@/lib/domain/calendar";
import { dayKpis, shiftDay, type DayBooking } from "@/lib/domain/today";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const STATUSES = new Set<TodaySession["status"]>(["open", "closed", "cancelled"]);
const ACTIVITY_LIMIT = 7;

/**
 * Datos de «Hoy» para un día (hora de Canarias): salidas con su ocupación, KPIs de las reservas
 * de esas salidas, avisos de las próximas 48 h (desde hoy) y la actividad reciente.
 */
export async function loadToday(day: string, today: string, now: Date) {
  const supabase = await createClient();
  const dayRange = rangeForDays([day]);
  const soonRange = rangeForDays([today, shiftDay(today, 1), shiftDay(today, 2)]);

  const [sessions, soon, activity] = await Promise.all([
    loadSessions(supabase, dayRange, now),
    loadSessions(supabase, soonRange, now),
    loadActivity(supabase),
  ]);
  const bookings = await loadDayBookings(
    supabase,
    sessions.map((session) => session.id),
  );

  return { sessions, kpis: dayKpis(sessions, bookings), soon, activity };
}

async function loadSessions(supabase: Supabase, range: { from: string; to: string }, now: Date): Promise<TodaySession[]> {
  const [{ data: rows, error }, { data: availability, error: availabilityError }] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, starts_at, ends_at, language, capacity, status, products!inner(name, color, min_pax)")
      .gte("starts_at", range.from)
      .lt("starts_at", range.to)
      .order("starts_at")
      .order("id"),
    supabase
      .from("session_availability")
      .select("session_id, booked_seats")
      .gte("starts_at", range.from)
      .lt("starts_at", range.to)
      .gt("booked_seats", 0),
  ]);
  if (error || availabilityError) throw new Error("No se pudieron cargar las salidas.");

  const booked = new Map(availability.map((row) => [row.session_id, row.booked_seats ?? 0]));
  return rows.map((row) => {
    const { date, time } = toBusinessDateTime(row.starts_at);
    return {
      id: row.id,
      startsAt: row.starts_at,
      date,
      time,
      endTime: toBusinessDateTime(row.ends_at).time,
      language: row.language,
      status: STATUSES.has(row.status as TodaySession["status"]) ? (row.status as TodaySession["status"]) : "closed",
      capacity: row.capacity,
      booked: booked.get(row.id) ?? 0,
      minPax: row.products.min_pax,
      started: new Date(row.starts_at) <= now,
      past: new Date(row.ends_at) <= now,
      product: { name: row.products.name, color: row.products.color },
    };
  });
}

// Lotes de ids para no pasarse del largo de URL de PostgREST.
const ID_CHUNK = 150;

async function loadDayBookings(supabase: Supabase, sessionIds: readonly string[]): Promise<DayBooking[]> {
  const bookings: DayBooking[] = [];
  for (let start = 0; start < sessionIds.length; start += ID_CHUNK) {
    const { data, error } = await supabase
      .from("bookings")
      .select("session_id, status, payment_status, total_cents, checked_in, booking_lines(qty)")
      .in("session_id", sessionIds.slice(start, start + ID_CHUNK))
      .eq("status", "confirmed");
    if (error) throw new Error("No se pudieron cargar las reservas.");
    for (const row of data) {
      bookings.push({
        sessionId: row.session_id,
        status: row.status,
        paymentStatus: row.payment_status,
        totalCents: row.total_cents,
        checkedIn: row.checked_in,
        pax: row.booking_lines.reduce((sum, line) => sum + line.qty, 0),
      });
    }
  }
  return bookings;
}

async function loadActivity(supabase: Supabase): Promise<ActivityItem[]> {
  const { data, error } = await supabase
    .from("booking_events")
    .select(
      "id, text, created_at, bookings!inner(code, status, channel, total_cents, customers!inner(name), sessions!inner(products!inner(name)), booking_lines(qty))",
    )
    .order("created_at", { ascending: false })
    .order("id")
    .limit(ACTIVITY_LIMIT);
  if (error) throw new Error("No se pudo cargar la actividad.");

  return data.map((row) => ({
    id: String(row.id),
    at: row.created_at,
    text: row.text,
    code: row.bookings.code,
    customerName: row.bookings.customers.name,
    productName: row.bookings.sessions.products.name,
    pax: row.bookings.booking_lines.reduce((sum, line) => sum + line.qty, 0),
    totalCents: row.bookings.total_cents,
    channel: row.bookings.channel,
    cancelled: row.bookings.status === "cancelled",
  }));
}
