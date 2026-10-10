import { STATE_PILL_CLASS } from "@/components/salidas/session-state-style";
import { Pill } from "@/components/ui/pill";
import { sessionState, type SessionStateKind } from "@/lib/domain/session-state";

import type { CalendarSession } from "./types";

// Estados que se ven en la tarjeta; «Ya salió» ya se nota porque la tarjeta sale atenuada.
const SHOWN = new Set<SessionStateKind>(["cancelled", "closed", "blocked", "full"]);

/** Estado de la salida (la misma regla que Hoy) o, si se vende con normalidad, su aviso. */
export function SessionStatus({ session }: { session: CalendarSession }) {
  const state = calendarState(session);
  if (SHOWN.has(state.kind)) {
    return (
      <Pill tone={state.tone === "warn" ? "warn" : "neutral"} className={STATE_PILL_CLASS[state.tone]}>
        {state.label}
      </Pill>
    );
  }
  if (session.status !== "cancelled" && session.booked > 0 && session.unstaffed) {
    return <Pill className="bg-danger-soft text-danger">Sin equipo</Pill>;
  }
  if (session.status !== "cancelled" && session.booked > 0 && session.booked < session.product.minPax) return <Pill tone="warn">Bajo mín.</Pill>;
  if (state.kind === "few") return <Pill tone="warn">{state.label}</Pill>;
  return null;
}

export function calendarState(session: CalendarSession) {
  return sessionState({ ...session, started: session.past });
}
