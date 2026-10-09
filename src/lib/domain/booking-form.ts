import type { PaymentMethod } from "@/lib/domain/pricing";

/** Formulario de nueva reserva interna (panel), como el prototipo. */

export type InternalChannel = "phone" | "desk" | "agency";

/** Opciones de cobro que ve el equipo. «Paga allí» no registra método: queda pendiente. */
export type PaymentOption = "card_terminal" | "cash" | "payment_link" | "on_site" | "invoice";

export const CHANNELS: readonly { value: InternalChannel; label: string }[] = [
  { value: "phone", label: "Teléfono" },
  { value: "desk", label: "Mostrador" },
  { value: "agency", label: "Agencia" },
];

const OPTION_LABELS: Record<PaymentOption, string> = {
  card_terminal: "TPV tarjeta",
  cash: "Efectivo",
  payment_link: "Enlace de pago",
  on_site: "Paga allí",
  invoice: "Factura a agencia",
};

/** Cobros posibles por canal: las agencias facturan o pagan en efectivo. */
export function paymentOptions(channel: InternalChannel): { value: PaymentOption; label: string }[] {
  const values: PaymentOption[] =
    channel === "agency" ? ["invoice", "cash"] : ["card_terminal", "cash", "payment_link", "on_site"];
  return values.map((value) => ({ value, label: OPTION_LABELS[value] }));
}

/** Cobro que se marca al elegir canal. */
export function defaultPayment(channel: InternalChannel): PaymentOption {
  return channel === "agency" ? "invoice" : "card_terminal";
}

export function isPaymentAllowed(channel: InternalChannel, option: PaymentOption): boolean {
  return paymentOptions(channel).some((candidate) => candidate.value === option);
}

/** Método que se guarda en la reserva (null = pendiente sin método). */
export function paymentMethodFor(option: PaymentOption): PaymentMethod | null {
  return option === "on_site" ? null : option;
}

/** Texto bajo el total: qué pasará con el cobro. */
export function paymentNote(option: PaymentOption): string {
  switch (option) {
    case "card_terminal":
    case "cash":
      return "Se registra como cobrado ahora.";
    case "payment_link":
      return "Queda pendiente de cobro con enlace de pago.";
    case "on_site":
      return "Quedará como pendiente de cobro en el manifiesto.";
    case "invoice":
      return "Se marcará para facturar a la agencia.";
  }
}

export type FormTicket = { id: string; takesSeat: boolean };

/** Plazas que ocupa la selección (los bebés en brazos no cuentan). */
export function selectedSeats(tickets: readonly FormTicket[], quantities: Readonly<Record<string, number>>): number {
  return tickets.reduce((sum, ticket) => sum + (ticket.takesSeat ? (quantities[ticket.id] ?? 0) : 0), 0);
}

/** ¿Se puede sumar una entrada más de este tipo con las plazas libres de la salida? */
export function canAddTicket(
  ticket: FormTicket,
  tickets: readonly FormTicket[],
  quantities: Readonly<Record<string, number>>,
  free: number,
): boolean {
  if ((quantities[ticket.id] ?? 0) >= 100) return false;
  return !ticket.takesSeat || selectedSeats(tickets, quantities) < free;
}
