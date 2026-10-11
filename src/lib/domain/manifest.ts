import { formatCents } from "@/lib/domain/money";

export type ManifestLine = { ticketName: string; qty: number };

export type ManifestBooking = {
  id: string;
  code: string;
  status: string;
  paymentStatus: string;
  totalCents: number;
  checkedIn: boolean;
  /** Personas que han llegado si solo ha llegado parte del grupo (null = todas). */
  arrivedPax?: number | null;
  /** No se ha presentado nadie. */
  noShow?: boolean;
  customerName: string;
  phone: string;
  email: string;
  hotel: string;
  lines: readonly ManifestLine[];
};

export type ManifestSummary = {
  pax: number;
  checkedIn: number;
  /** Personas de las reservas marcadas como «No se ha presentado». */
  noShows: number;
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

export type Arrival = { checkedIn: boolean; arrivedPax?: number | null; noShow?: boolean };

/** Personas de la reserva que han llegado. */
export function arrivedOf(booking: Arrival & { pax: number }): number {
  if (!booking.checkedIn) return 0;
  return Math.min(booking.arrivedPax ?? booking.pax, booking.pax);
}

export type ArrivalState = "pending" | "arrived" | "partial" | "no_show";

export function arrivalState(booking: Arrival): ArrivalState {
  if (booking.checkedIn) return booking.arrivedPax != null ? "partial" : "arrived";
  return booking.noShow ? "no_show" : "pending";
}

/** «Presentado», «Llegan 2 de 4», «No se ha presentado», «Por llegar». */
export function arrivalLabel(booking: Arrival & { pax: number }): string {
  switch (arrivalState(booking)) {
    case "arrived":
      return "Presentado";
    case "partial":
      return `Llegan ${arrivedOf(booking)} de ${booking.pax}`;
    case "no_show":
      return "No se ha presentado";
    default:
      return "Por llegar";
  }
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
    checkedIn: live.reduce((sum, booking) => sum + arrivedOf({ ...booking, pax: paxOf(booking) }), 0),
    noShows: live.filter((booking) => arrivalState(booking) === "no_show").reduce((sum, booking) => sum + paxOf(booking), 0),
    dueCents: live.filter(canCollect).reduce((sum, booking) => sum + booking.totalCents, 0),
    invoiceCount: live.filter((booking) => booking.paymentStatus === "invoice").length,
    tickets: [...tickets].map(([ticketName, qty]) => ({ ticketName, qty })),
  };
}

/** Texto para «Copiar» (pegar en WhatsApp o enviar al guía). */
export function manifestText(header: { productName: string; dateLabel: string; time: string; language: string }, bookings: readonly ManifestBooking[]): string {
  const rows = sortManifest(bookings.filter(isLive)).map((booking) => {
    const parts = [
      `${checkMark(booking)} ${booking.customerName}`,
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

function checkMark(booking: ManifestBooking): string {
  switch (arrivalState(booking)) {
    case "arrived":
      return "[x]";
    case "partial":
      return `[${arrivedOf({ ...booking, pax: paxOf(booking) })}/${paxOf(booking)}]`;
    case "no_show":
      return "[no vino]";
    default:
      return "[ ]";
  }
}
