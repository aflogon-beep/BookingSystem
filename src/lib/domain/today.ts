import { addDays, format, isValid, parseISO } from "date-fns";

import { RESOURCE_TYPES, RESOURCE_TYPE_TEXT, type ResourceType } from "@/lib/domain/resources";

export type DayBooking = {
  sessionId: string;
  status: string;
  paymentStatus: string;
  totalCents: number;
  pax: number;
  checkedIn: boolean;
};

export type DaySessionSummary = { id: string; status: string };

export type DayKpis = {
  sessions: number;
  sessionsWithBookings: number;
  bookings: number;
  pax: number;
  checkedIn: number;
  checkInPercent: number;
  revenueCents: number;
  pendingPayments: number;
};

/** Fecha de `?fecha=` (YYYY-MM-DD válida, años 2000-2099) o hoy. */
export function parseDayParam(raw: string | string[] | undefined, today: string): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !/^(20\d{2})-\d{2}-\d{2}$/.test(value)) return today;
  const parsed = parseISO(value);
  return isValid(parsed) && format(parsed, "yyyy-MM-dd") === value ? value : today;
}

export function shiftDay(day: string, delta: number): string {
  return format(addDays(parseISO(day), delta), "yyyy-MM-dd");
}

/** Etiqueta encima de la fecha, como el prototipo. */
export function dayLabel(day: string, today: string): "Hoy" | "Día pasado" | "Próximamente" {
  if (day === today) return "Hoy";
  return day < today ? "Día pasado" : "Próximamente";
}

/**
 * KPIs del día. Cuentan solo las reservas confirmadas (los bloqueos web pendientes aún no son
 * venta). Salidas: las no canceladas. Pagos pendientes: confirmadas con pago `pending` (las de
 * factura a agencia no cuentan, se cobran aparte).
 */
export function dayKpis(sessions: readonly DaySessionSummary[], bookings: readonly DayBooking[]): DayKpis {
  const live = sessions.filter((session) => session.status !== "cancelled");
  const confirmed = bookings.filter((booking) => booking.status === "confirmed");
  const pax = confirmed.reduce((sum, booking) => sum + booking.pax, 0);
  const checkedIn = confirmed.reduce((sum, booking) => sum + (booking.checkedIn ? booking.pax : 0), 0);
  return {
    sessions: live.length,
    sessionsWithBookings: live.filter((session) => confirmed.some((booking) => booking.sessionId === session.id)).length,
    bookings: confirmed.length,
    pax,
    checkedIn,
    checkInPercent: pax ? Math.round((checkedIn / pax) * 100) : 0,
    revenueCents: confirmed.reduce((sum, booking) => sum + booking.totalCents, 0),
    pendingPayments: confirmed.filter((booking) => booking.paymentStatus === "pending").length,
  };
}

/** Equipo que le falta a una salida, por tipo (vista session_staffing). */
export type MissingByType = Record<ResourceType, number>;

export const NOTHING_MISSING: MissingByType = { guide: 0, vehicle: 0, equipment: 0 };

export const totalMissing = (missing: MissingByType) => RESOURCE_TYPES.reduce((sum, type) => sum + missing[type], 0);

/** «Sin guía asignado», «Sin guía/vehículo asignado». A diferencia del prototipo, solo nombra lo que falta. */
export function missingText(missing: MissingByType): string {
  const types = RESOURCE_TYPES.filter((type) => missing[type] > 0).map((type) => RESOURCE_TYPE_TEXT[type].singular);
  return `Sin ${types.join("/")} asignado`;
}

export type FlaggableSession = { status: string; booked: number; capacity: number; minPax: number; missing: MissingByType };

export type SessionFlag = {
  label: "Cerrada" | "Cancelada" | "Sin equipo" | "Bajo mínimo" | "Completa";
  tone: "neutral" | "danger" | "warn" | "blue";
};

/** Avisos de una salida en la lista del día, en el orden del prototipo. */
export function sessionFlags(session: FlaggableSession): SessionFlag[] {
  const flags: SessionFlag[] = [];
  if (session.status === "closed") flags.push({ label: "Cerrada", tone: "neutral" });
  if (session.status === "cancelled") flags.push({ label: "Cancelada", tone: "danger" });
  if (session.status !== "cancelled" && session.booked > 0 && totalMissing(session.missing) > 0) {
    flags.push({ label: "Sin equipo", tone: "danger" });
  }
  if (session.status !== "cancelled" && session.booked > 0 && session.booked < session.minPax) {
    flags.push({ label: "Bajo mínimo", tone: "warn" });
  }
  if (session.status === "open" && session.booked >= session.capacity) flags.push({ label: "Completa", tone: "blue" });
  return flags;
}

/** Se puede reservar desde el panel: abierta, sin haber salido aún (como create_booking_hold) y con plazas. */
export function canBookSession(session: { status: string; started: boolean; booked: number; capacity: number }): boolean {
  return session.status === "open" && !session.started && session.booked < session.capacity;
}

export type AttentionSession = FlaggableSession & { id: string; startsAt: string };

export type AttentionItem<T extends AttentionSession> = { session: T; kind: "staff" | "min"; text: string };

/**
 * Avisos («Requiere atención» y la campana): salidas abiertas que aún no han salido y tienen
 * reservas, sin el equipo que necesitan o por debajo del mínimo. Como el prototipo, una salida
 * puede dar los dos avisos.
 */
export function attentionItems<T extends AttentionSession>(sessions: readonly T[], now: Date): AttentionItem<T>[] {
  return sessions
    .filter((session) => session.status === "open" && new Date(session.startsAt) > now && session.booked > 0)
    .flatMap((session) => {
      const items: AttentionItem<T>[] = [];
      if (totalMissing(session.missing) > 0) items.push({ session, kind: "staff", text: missingText(session.missing) });
      if (session.booked < session.minPax) {
        items.push({ session, kind: "min", text: `Faltan ${session.minPax - session.booked} para el mínimo (${session.minPax})` });
      }
      return items;
    });
}

/** «ahora», «hace 5 min», «hace 3 h», «ayer», «hace 4 días». */
export function timeAgo(instant: string, now: Date): string {
  const minutes = Math.round((now.getTime() - new Date(instant).getTime()) / 60000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "ayer" : `hace ${days} días`;
}
