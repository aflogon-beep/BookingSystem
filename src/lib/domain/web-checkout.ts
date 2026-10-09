import { z } from "zod";

import { bookingTotal } from "@/lib/domain/pricing";

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
): Cart {
  const lines: CartLine[] = [];
  for (const line of requested) {
    const ticket = tickets.find((candidate) => candidate.id === line.ticketTypeId);
    if (!ticket) return { ok: false, error: "Alguna de las entradas ya no se vende. Vuelve a elegirlas." };
    lines.push({ ticket, qty: line.qty });
  }
  const seats = lines.reduce((sum, line) => sum + (line.ticket.takesSeat ? line.qty : 0), 0);
  if (seats === 0) return { ok: false, error: "Añade al menos una entrada con plaza." };
  if (seats > WEB_MAX_SEATS) return { ok: false, error: GROUP_MESSAGE };
  if (seats > free) {
    return {
      ok: false,
      error: free === 1 ? "Solo queda 1 plaza en esta salida." : `Solo quedan ${free} plazas en esta salida.`,
    };
  }
  const totalCents = bookingTotal(lines.map((line) => ({ qty: line.qty, unitPriceCents: line.ticket.priceCents })));
  return { ok: true, lines, seats, totalCents };
}

/** «2 Adulto · 1 Niño». */
export function cartLabel(lines: readonly { ticket: { name: string }; qty: number }[]): string {
  return lines.map((line) => `${line.qty} ${line.ticket.name}`).join(" · ");
}

/** Datos del cliente que envía el formulario. `trap` es un campo trampa para bots: debe llegar vacío. */
export const webCustomerSchema = z.object({
  name: z.string().trim().min(1, "Escribe tu nombre y apellidos.").max(120, "El nombre es demasiado largo."),
  email: z.string().trim().toLowerCase().pipe(z.email("Revisa el email: no parece válido.").max(254)),
  phone: z
    .string()
    .trim()
    .max(40, "El teléfono es demasiado largo.")
    .refine((value) => /^[0-9+()\s.-]*$/.test(value), "El teléfono solo puede tener números, espacios y + ( ) - .")
    .optional()
    .default(""),
  hotel: z.string().trim().max(200, "El nombre del hotel es demasiado largo.").optional().default(""),
  trap: z.string().max(0).optional().default(""),
});

export type WebCustomerInput = z.input<typeof webCustomerSchema>;

const GROUP_MESSAGE = `Por la web puedes reservar hasta ${WEB_MAX_SEATS} plazas. Para grupos, llámanos.`;

/** Mensaje para el cliente según el código de error de create_booking_hold. */
export function webBookingErrorMessage(code: string | undefined, hint: string | undefined): string {
  switch (code) {
    case "RB001": {
      const free = hint === undefined || hint.trim() === "" ? Number.NaN : Number(hint);
      if (free === 0) return "Lo sentimos: esta salida se acaba de completar. Elige otro horario.";
      return Number.isInteger(free) && free > 0
        ? `Solo ${free === 1 ? "queda 1 plaza" : `quedan ${free} plazas`} en esta salida. Quita alguna entrada.`
        : "No quedan plazas suficientes en esta salida.";
    }
    case "RB002":
    case "P0002":
      return "Esta salida ya no admite reservas. Elige otro horario.";
    case "RB003":
      return "Alguna de las entradas ya no se vende. Vuelve a elegirlas.";
    case "RB008":
      return GROUP_MESSAGE;
    default:
      return "No se pudo completar la reserva. Inténtalo de nuevo en unos minutos.";
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
