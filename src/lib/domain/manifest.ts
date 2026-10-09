import { formatCents } from "@/lib/domain/money";

export type ManifestLine = { ticketName: string; qty: number };

export type ManifestBooking = {
  id: string;
  code: string;
  status: string;
  paymentStatus: string;
  totalCents: number;
  checkedIn: boolean;
  customerName: string;
  phone: string;
  email: string;
  hotel: string;
  lines: readonly ManifestLine[];
};

export type ManifestSummary = {
  pax: number;
  checkedIn: number;
  dueCents: number;
  invoiceCount: number;
  tickets: ManifestLine[];
};

/** Las que cuentan en el manifiesto: confirmadas (las pendientes web y las caducadas, no). */
export function isLive(booking: Pick<ManifestBooking, "status">): boolean {
  return booking.status === "confirmed";
}

export function paxOf(booking: Pick<ManifestBooking, "lines">): number {
  return booking.lines.reduce((sum, line) => sum + line.qty, 0);
}

/** «2 adulto · 1 niño». */
export function ticketsLabel(lines: readonly ManifestLine[]): string {
  return lines.map((line) => `${line.qty} ${line.ticketName.toLowerCase()}`).join(" · ");
}

/** Se cobra en el manifiesto: confirmada con el pago pendiente (la factura a agencia, no). */
export function canCollect(booking: Pick<ManifestBooking, "status" | "paymentStatus">): boolean {
  return booking.status === "confirmed" && booking.paymentStatus === "pending";
}

/** Confirmadas primero (por nombre) y después el resto, como el prototipo. */
export function sortManifest<T extends Pick<ManifestBooking, "status" | "customerName">>(bookings: readonly T[]): T[] {
  return [...bookings].sort(
    (a, b) => Number(!isLive(a)) - Number(!isLive(b)) || a.customerName.localeCompare(b.customerName, "es"),
  );
}

/** Cifras de cabecera: pasajeros, presentados, pendiente de cobro, a facturar y entradas por tipo. */
export function manifestSummary(
  bookings: readonly (ManifestBooking & { paymentStatus: string })[],
): ManifestSummary {
  const live = bookings.filter(isLive);
  const tickets = new Map<string, number>();
  for (const booking of live) {
    for (const line of booking.lines) tickets.set(line.ticketName, (tickets.get(line.ticketName) ?? 0) + line.qty);
  }
  return {
    pax: live.reduce((sum, booking) => sum + paxOf(booking), 0),
    checkedIn: live.reduce((sum, booking) => sum + (booking.checkedIn ? paxOf(booking) : 0), 0),
    dueCents: live.filter(canCollect).reduce((sum, booking) => sum + booking.totalCents, 0),
    invoiceCount: live.filter((booking) => booking.paymentStatus === "invoice").length,
    tickets: [...tickets].map(([ticketName, qty]) => ({ ticketName, qty })),
  };
}

/** Texto para «Copiar» (pegar en WhatsApp o enviar al guía). */
export function manifestText(header: { productName: string; dateLabel: string; time: string; language: string }, bookings: readonly ManifestBooking[]): string {
  const rows = sortManifest(bookings.filter(isLive)).map((booking) => {
    const parts = [
      `${booking.checkedIn ? "[x]" : "[ ]"} ${booking.customerName}`,
      `${paxOf(booking)} pax (${ticketsLabel(booking.lines)})`,
    ];
    if (booking.phone) parts.push(booking.phone);
    if (booking.hotel) parts.push(booking.hotel);
    if (canCollect(booking)) parts.push(`COBRAR ${formatCents(booking.totalCents)}`);
    return parts.join(" · ");
  });
  const title = `${header.productName}\n${header.dateLabel} · ${header.time} · ${header.language.toUpperCase()}`;
  return rows.length ? `${title}\n\n${rows.join("\n")}` : `${title}\n\nSin reservas.`;
}
