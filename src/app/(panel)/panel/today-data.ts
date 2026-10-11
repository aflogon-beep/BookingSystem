import "server-only";

import { cache } from "react";

import type { ActivityItem, TodaySession } from "@/components/hoy/types";
import { createClient } from "@/lib/db/server";
import { rangeForDays, toBusinessDateTime } from "@/lib/domain/calendar";
import { businessToday } from "@/lib/domain/schedule";
import { webSalesOpen } from "@/lib/domain/session-state";
import { NOTHING_MISSING, attentionItems, dayKpis, shiftDay, type DayBooking, type MissingByType } from "@/lib/domain/today";

import { loadBlockedNeeds, loadCutoffHours } from "./team-status";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const STATUSES = new Set<TodaySession["status"]>(["open", "closed", "cancelled"]);
const ACTIVITY_LIMIT = 7;

/**
 * Datos de «Hoy» para un día (hora de Canarias): salidas con su ocupación, KPIs de las reservas
 * de esas salidas, avisos de las próximas 48 h (desde hoy) y la actividad reciente.
 * Todo sale en paralelo: si el día es uno de los tres de los avisos, sus salidas se toman de ahí.
 */
export async function loadToday(day: string, today: string, now: Date) {
  const supabase = await createClient();
  const dayRange = rangeForDays([day]);
  const soonDays = [today, shiftDay(today, 1), shiftDay(today, 2)];

  const [soon, daySessions, bookings, activity] = await Promise.all([
    loadSoonSessions(today),
    soonDays.includes(day) ? null : loadSessions(supabase, dayRange, now),
    loadDayBookings(supabase, dayRange),
    loadActivity(supabase),
  ]);
  const sessions = daySessions ?? soon.filter((session) => session.date === day);

  return { sessions, kpis: dayKpis(sessions, bookings), soon, activity };
}

/**
 * Salidas de las próximas 48 h (hoy, mañana y pasado, como el prototipo): las de los avisos.
 * Se cachea por petición: la campana del layout y la página de Hoy o Avisos comparten la consulta.
 */
export const loadSoonSessions = cache(async (today: string): Promise<TodaySession[]> =>
  loadSessions(await createClient(), rangeForDays([today, shiftDay(today, 1), shiftDay(today, 2)]), new Date()),
);

async function loadSessions(supabase: Supabase, range: { from: string; to: string }, now: Date): Promise<TodaySession[]> {
  const [
    { data: rows, error },
    { data: availability, error: availabilityError },
    { data: staffing, error: staffingError },
    blocked,
    cutoffHours,
  ] = await Promise.all([
    supabase
      .from("sessions")
      .select(
        "id, starts_at, ends_at, language, capacity, status, products!inner(name, color, min_pax, active), session_resources(resources(name, type))",
      )
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
    supabase
      .from("session_staffing")
      .select("session_id, missing_guides, missing_vehicles, missing_equipment")
      .gte("starts_at", range.from)
      .lt("starts_at", range.to)
      .gt("missing", 0),
    loadBlockedNeeds(supabase, range),
    loadCutoffHours(supabase),
  ]);
  if (error || availabilityError || staffingError) throw new Error("No se pudieron cargar las salidas.");

  const booked = new Map(availability.map((row) => [row.session_id, row.booked_seats ?? 0]));
  const missing = new Map<string | null, MissingByType>(
    staffing.map((row) => [
      row.session_id,
      { guide: row.missing_guides ?? 0, vehicle: row.missing_vehicles ?? 0, equipment: row.missing_equipment ?? 0 },
    ]),
  );
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
      missing: missing.get(row.id) ?? NOTHING_MISSING,
      guides: guideNames(row.session_resources),
      blockingNeed: blocked.get(row.id) ?? null,
      webOpen: webSalesOpen(row.starts_at, row.products.active, cutoffHours, now),
      started: new Date(row.starts_at) <= now,
      past: new Date(row.ends_at) <= now,
      product: { name: row.products.name, color: row.products.color },
    };
  });
}

/** Nombres de los guías asignados a una salida, en orden alfabético. */
function guideNames(assigned: readonly { resources: { name: string; type: string } | null }[]): string[] {
  return assigned
    .flatMap((row) => (row.resources?.type === "guide" ? [row.resources.name] : []))
    .sort((a, b) => a.localeCompare(b, "es"));
}

// PostgREST corta cada respuesta en max_rows (1000).
const PAGE_SIZE = 1000;

/** Reservas confirmadas de las salidas de ese día (para los KPIs). */
async function loadDayBookings(supabase: Supabase, range: { from: string; to: string }): Promise<DayBooking[]> {
  const bookings: DayBooking[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("bookings")
      .select("id, session_id, status, payment_status, total_cents, checked_in, arrived_pax, booking_lines(qty), sessions!inner(starts_at)")
      .eq("status", "confirmed")
      .gte("sessions.starts_at", range.from)
      .lt("sessions.starts_at", range.to)
      .order("id")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error("No se pudieron cargar las reservas.");
    for (const row of data) {
      bookings.push({
        sessionId: row.session_id,
        status: row.status,
        paymentStatus: row.payment_status,
        totalCents: row.total_cents,
        checkedIn: row.checked_in,
        arrivedPax: row.arrived_pax,
        pax: row.booking_lines.reduce((sum, line) => sum + line.qty, 0),
      });
    }
    if (data.length < PAGE_SIZE) return bookings;
  }
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

/** Cuántos avisos hay ahora (el punto rojo de la campana). */
export async function countAlerts(now = new Date()): Promise<number> {
  return attentionItems(await loadSoonSessions(businessToday(now)), now).length;
}
