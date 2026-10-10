import { Pill } from "@/components/ui/pill";

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
