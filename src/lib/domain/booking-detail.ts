import { addDays, format } from "date-fns";
import { es } from "date-fns/locale";
import { TZDate } from "@date-fns/tz";

import { formatCents } from "./money";
import { BUSINESS_TIMEZONE } from "./schedule";

// Ficha de reserva del panel (tarea 2.4): cancelar con o sin reembolso y cambiar de fecha.

export const MOVE_WINDOW_DAYS = 30;
export const MOVE_OPTIONS_LIMIT = 40;

export type MoveCandidate = { id: string; startsAt: string; language: string; status: string; free: number };

/** Plazas que ocupa una reserva (las entradas sin plaza, como bebés, no cuentan). */
export function seatsOf(lines: readonly { qty: number; takesSeat: boolean }[]): number {
  return lines.reduce((sum, line) => sum + (line.takesSeat ? line.qty : 0), 0);
}

/**
 * Salidas a las que se puede mover una reserva: otras del mismo producto (ya filtradas al leerlas),
 * a la venta, que no hayan empezado, en los próximos 30 días y con plazas para toda la reserva.
 * La BD lo vuelve a comprobar con la salida bloqueada (booking_move).
 */
export function moveOptions(
  candidates: readonly MoveCandidate[],
  currentSessionId: string,
  seats: number,
  now: Date,
): MoveCandidate[] {
  const until = addDays(now, MOVE_WINDOW_DAYS).getTime();
  return candidates
    .filter((session) => {
      const start = new Date(session.startsAt).getTime();
      return (
        session.id !== currentSessionId &&
        session.status === "open" &&
        start > now.getTime() &&
        start <= until &&
        session.free >= seats
      );
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, MOVE_OPTIONS_LIMIT);
}

/** «mié 14 oct · 16:30 · ES · 5 libres», como el selector del prototipo. */
export function moveOptionLabel(session: MoveCandidate): string {
  const local = new TZDate(new Date(session.startsAt).getTime(), BUSINESS_TIMEZONE);
  return `${format(local, "EEE d MMM · HH:mm", { locale: es })} · ${session.language.toUpperCase()} · ${session.free} ${session.free === 1 ? "libre" : "libres"}`;
}

/** Dentro del plazo de cancelación gratuita de Ajustes (con 0 horas, siempre hasta la salida). */
export function isFreeCancellation(startsAt: string, now: Date, cancelHours: number): boolean {
  return new Date(startsAt).getTime() - now.getTime() >= cancelHours * 3_600_000;
}

/** Se puede cancelar o cambiar de fecha mientras la salida no haya empezado. */
export function isEditable(status: string, startsAt: string, now: Date): boolean {
  return status === "confirmed" && new Date(startsAt).getTime() > now.getTime();
}

const METHOD_LABELS: Record<string, string> = {
  cash: "Efectivo",
  card_terminal: "TPV tarjeta",
  card_online: "Tarjeta online",
  payment_link: "Enlace de pago",
  invoice: "Factura",
};

/** Línea «Pago» de la ficha. */
export function paymentLabel(booking: {
  paymentStatus: string;
  paymentMethod: string | null;
  paidCents: number;
  agent: string;
}): string {
  switch (booking.paymentStatus) {
    case "paid":
      return [formatCents(booking.paidCents), METHOD_LABELS[booking.paymentMethod ?? ""]].filter(Boolean).join(" · ");
    case "refunded":
      return `Reembolsado ${formatCents(booking.paidCents)}`;
    case "invoice":
      return booking.agent ? `Se factura a ${booking.agent}` : "Se factura a la agencia";
    default:
      return booking.paymentMethod === "payment_link" ? "Enlace enviado, sin pagar" : "Pendiente";
  }
}

export const CHANNEL_LABELS: Record<string, string> = {
  web: "Web",
  phone: "Teléfono",
  desk: "Mostrador",
  agency: "Agencia",
};

/** Mensajes de error de booking_cancel y booking_move. */
export function bookingChangeError(code: string | undefined, hint: string | undefined): string {
  switch (code) {
    case "RB001": {
      const free = Number(hint);
      return Number.isInteger(free)
        ? `Esa salida ya solo tiene ${free} ${free === 1 ? "plaza libre" : "plazas libres"}. Elige otra.`
        : "Esa salida ya no tiene plazas suficientes. Elige otra.";
    }
    case "RB002":
      return "Esa salida ya no está a la venta. Elige otra.";
    case "RB007":
      return "La salida ya ha empezado: la reserva no se puede cambiar.";
    case "RB009":
      return "La reserva ya está cancelada.";
    case "22023":
      return "Elige otra salida del mismo producto.";
    case "P0002":
      return "No se ha encontrado. Recarga la página.";
    case "42501":
      return "No tienes permiso para hacer esto.";
    case "40001":
      return "La reserva acaba de cambiar. Recarga la página e inténtalo de nuevo.";
    default:
      return "No se pudo guardar. Inténtalo de nuevo.";
  }
}
