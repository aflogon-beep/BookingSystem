/** Importes de una reserva, en céntimos. El servidor (create_booking_hold) usa los precios de la BD. */

export type PricedLine = { qty: number; unitPriceCents: number };

/** Total = Σ cantidad × precio unitario congelado. */
export function bookingTotal(lines: readonly PricedLine[]): number {
  return lines.reduce((sum, line) => sum + line.qty * line.unitPriceCents, 0);
}

export type Channel = "web" | "phone" | "desk" | "agency";
export type PaymentMethod = "card_online" | "card_terminal" | "cash" | "payment_link" | "invoice";
export type PaymentStatus = "pending" | "paid" | "refunded" | "invoice";

/**
 * Estado de pago de una reserva nueva, como create_booking_hold: la web queda pendiente hasta que
 * Stripe confirme; en el panel, TPV o efectivo es pagada, factura va a factura y el resto pendiente.
 */
export function initialPaymentStatus(channel: Channel, method: PaymentMethod | null): PaymentStatus {
  if (channel === "web") return "pending";
  if (method === "card_terminal" || method === "cash") return "paid";
  if (method === "invoice") return "invoice";
  return "pending";
}
