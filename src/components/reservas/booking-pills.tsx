import { Pill } from "@/components/ui/pill";
import { arrivalLabel, arrivalState, type Arrival } from "@/lib/domain/manifest";

/** Estado del pago en listados, como el prototipo. */
export function PaymentPill({ paymentStatus }: { paymentStatus: string }) {
  if (paymentStatus === "paid") return <Pill tone="ok">Pagado</Pill>;
  if (paymentStatus === "refunded") return <Pill>Reembolsado</Pill>;
  if (paymentStatus === "invoice") return <Pill className="bg-primary-soft text-primary-dark">A facturar</Pill>;
  return <Pill tone="warn">Pendiente</Pill>;
}

/** Estado de la reserva en listados: cancelada, presentado o confirmada. */
export function BookingStatusPill({ status, checkedIn }: { status: string; checkedIn: boolean }) {
  if (status === "cancelled") return <Pill className="bg-danger-soft text-danger">Cancelada</Pill>;
  if (checkedIn) return <Pill tone="ok">Presentado</Pill>;
  return <Pill className="bg-primary-soft text-primary-dark">Confirmada</Pill>;
}

/** Estado en la ficha y la vista previa: además de cancelada, el pago web a medias y cómo llegó el grupo. */
export function BookingArrivalPill({ booking }: { booking: Arrival & { status: string; pax: number } }) {
  if (booking.status === "cancelled" || booking.status === "expired") {
    return <Pill className="bg-danger-soft text-danger">Cancelada</Pill>;
  }
  if (booking.status === "pending") return <Pill tone="warn">Pago web a medias</Pill>;
  const state = arrivalState(booking);
  if (state === "no_show") return <Pill className="bg-danger-soft text-danger">No se ha presentado</Pill>;
  if (state === "partial" || state === "arrived") {
    return <Pill tone={state === "arrived" ? "ok" : "warn"}>{arrivalLabel(booking)}</Pill>;
  }
  return <Pill className="bg-primary-soft text-primary">Confirmada</Pill>;
}
