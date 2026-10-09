import { z } from "zod";

import type { Locale } from "@/lib/domain/i18n";
import { bookingTotal } from "@/lib/domain/pricing";
import { webText } from "@/lib/domain/web-text";

/** Reserva desde la web pública (sin pasarela: se paga el día del tour). */

/** Plazas como máximo en una reserva web sin pago (igual que create_booking_hold, RB008). */
export const WEB_MAX_SEATS = 10;

export type CartTicket = { id: string; name: string; takesSeat: boolean; priceCents: number };

export type CartLine = { ticket: CartTicket; qty: number };

export type Cart =
  | { ok: true; lines: CartLine[]; seats: number; totalCents: number }
  | { ok: false; error: string };

/**
 * Comprueba las entradas pedidas contra las del producto y las plazas libres. Es solo para
 * mostrar el resumen y avisar pronto: create_booking_hold vuelve a comprobarlo todo con la salida
 * bloqueada y con los precios de la BD.
 */
export function resolveCart(
  tickets: readonly CartTicket[],
  requested: readonly { ticketTypeId: string; qty: number }[],
  free: number,
  locale: Locale = "es",
): Cart {
  const text = webText(locale);
  const lines: CartLine[] = [];
  for (const line of requested) {
    const ticket = tickets.find((candidate) => candidate.id === line.ticketTypeId);
    if (!ticket) return { ok: false, error: text.errors.ticketGone };
    lines.push({ ticket, qty: line.qty });
  }
  const seats = lines.reduce((sum, line) => sum + (line.ticket.takesSeat ? line.qty : 0), 0);
  if (seats === 0) return { ok: false, error: text.errors.noSeatTicket };
  if (seats > WEB_MAX_SEATS) return { ok: false, error: text.groupLimit(WEB_MAX_SEATS) };
  if (seats > free) return { ok: false, error: text.onlyLeft(free) };
  const totalCents = bookingTotal(lines.map((line) => ({ qty: line.qty, unitPriceCents: line.ticket.priceCents })));
  return { ok: true, lines, seats, totalCents };
}

/** «2 Adulto · 1 Niño». */
export function cartLabel(lines: readonly { ticket: { name: string }; qty: number }[]): string {
  return lines.map((line) => `${line.qty} ${line.ticket.name}`).join(" · ");
}

/** Datos del cliente que envía el formulario. `trap` es un campo trampa para bots: debe llegar vacío. */
export function webCustomerSchemaFor(locale: Locale) {
  const errors = webText(locale).errors;
  return z.object({
    name: z.string().trim().min(1, errors.name).max(120, errors.nameTooLong),
    email: z.string().trim().toLowerCase().pipe(z.email(errors.email).max(254)),
    phone: z
      .string()
      .trim()
      .max(40, errors.phoneTooLong)
      .refine((value) => /^[0-9+()\s.-]*$/.test(value), errors.phoneChars)
      .optional()
      .default(""),
    hotel: z.string().trim().max(200, errors.hotelTooLong).optional().default(""),
    trap: z.string().max(0).optional().default(""),
  });
}

export const webCustomerSchema = webCustomerSchemaFor("es");

export type WebCustomerInput = z.input<typeof webCustomerSchema>;

/** Mensaje para el cliente según el código de error de create_booking_hold. */
export function webBookingErrorMessage(code: string | undefined, hint: string | undefined, locale: Locale = "es"): string {
  const text = webText(locale);
  switch (code) {
    case "RB001": {
      const free = hint === undefined || hint.trim() === "" ? Number.NaN : Number(hint);
      if (free === 0) return text.errors.justSoldOut;
      return Number.isInteger(free) && free > 0 ? text.errors.removeSome(free) : text.errors.notEnoughSeats;
    }
    case "RB002":
    case "P0002":
      return text.errors.notBookable;
    case "RB003":
      return text.errors.ticketGone;
    case "RB008":
      return text.groupLimit(WEB_MAX_SEATS);
    default:
      return text.errors.generic;
  }
}

/** Cookie con las últimas reservas hechas en este navegador: solo ese navegador ve su confirmación. */
export const RECENT_BOOKINGS_COOKIE = "reservas_web";

/** Añade una reserva a la cookie (máximo 5, la más reciente primero). */
export function addRecentBooking(current: string | undefined, bookingId: string): string {
  const ids = (current ?? "").split(",").filter((id) => /^[0-9a-f-]{36}$/.test(id) && id !== bookingId);
  return [bookingId, ...ids].slice(0, 5).join(",");
}

export function hasRecentBooking(current: string | undefined, bookingId: string): boolean {
  return (current ?? "").split(",").includes(bookingId);
}
