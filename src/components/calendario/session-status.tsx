import { Pill } from "@/components/ui/pill";

import type { CalendarSession } from "./types";

/** Aviso de la salida, en el orden del prototipo: cancelada, bajo mínimo o cerrada. */
export function SessionStatus({ session }: { session: CalendarSession }) {
  if (session.status === "cancelled") {
    return <Pill className="bg-danger-soft text-danger">Cancelada</Pill>;
  }
  if (session.booked > 0 && session.booked < session.product.minPax) return <Pill tone="warn">Bajo mín.</Pill>;
  if (session.status === "closed") return <Pill>Cerrada</Pill>;
  return null;
}
