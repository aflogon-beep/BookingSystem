import { Pill } from "@/components/ui/pill";
import { blockedText } from "@/lib/domain/today";

import type { CalendarSession } from "./types";

/**
 * Aviso de la salida, en el orden del prototipo: cancelada, sin equipo, bajo mínimo o cerrada. Antes
 * que «sin equipo», si no admite reservas porque su recurso obligatorio está en otra salida.
 */
export function SessionStatus({ session }: { session: CalendarSession }) {
  if (session.status === "cancelled") {
    return <Pill className="bg-danger-soft text-danger">Cancelada</Pill>;
  }
  if (session.status === "open" && !session.past && session.blockingNeed) {
    return <Pill tone="warn">{blockedText(session.blockingNeed)}</Pill>;
  }
  if (session.booked > 0 && session.unstaffed) return <Pill className="bg-danger-soft text-danger">Sin equipo</Pill>;
  if (session.booked > 0 && session.booked < session.product.minPax) return <Pill tone="warn">Bajo mín.</Pill>;
  if (session.status === "closed") return <Pill>Cerrada</Pill>;
  return null;
}
