/**
 * Plazas de una salida. Es la misma regla que aplican en BD la vista `session_availability` y
 * `create_booking_hold`: ocupan plaza las entradas con `takes_seat` de las reservas confirmadas y
 * de las pendientes con el bloqueo vigente.
 */

export type BookingStatus = "pending" | "confirmed" | "cancelled" | "expired";

export type SeatLine = { qty: number; takesSeat: boolean };

export type BookingSeats = { status: BookingStatus; holdExpiresAt: Date | null; lines: readonly SeatLine[] };

/** Entradas que ocupan plaza (un bebé en brazos cuenta como pasajero pero no ocupa asiento). */
export function seatsOf(lines: readonly SeatLine[]): number {
  return lines.reduce((sum, line) => sum + (line.takesSeat ? line.qty : 0), 0);
}

/** ¿Esta reserva ocupa plaza ahora? */
export function holdsSeats(booking: Pick<BookingSeats, "status" | "holdExpiresAt">, now: Date): boolean {
  if (booking.status === "confirmed") return true;
  return booking.status === "pending" && booking.holdExpiresAt !== null && booking.holdExpiresAt > now;
}

export function occupiedSeats(bookings: readonly BookingSeats[], now: Date): number {
  return bookings.reduce((sum, booking) => sum + (holdsSeats(booking, now) ? seatsOf(booking.lines) : 0), 0);
}

/** Plazas libres, nunca negativas. */
export function freeSeats(capacity: number, occupied: number): number {
  return Math.max(capacity - occupied, 0);
}

/** ¿Cabe una reserva de `requested` plazas? */
export function canBook(capacity: number, occupied: number, requested: number): boolean {
  return requested > 0 && requested <= capacity - occupied;
}
