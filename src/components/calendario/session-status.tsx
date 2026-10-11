import { STATE_PILL_CLASS } from "@/components/salidas/session-state-style";
import { Pill } from "@/components/ui/pill";
import { cn } from "@/lib/utils";
import { sessionState, type SessionStateKind } from "@/lib/domain/session-state";

import type { CalendarSession } from "./types";

// Estados que se ven en la tarjeta; «Ya salió» ya se nota porque la tarjeta sale atenuada.
export const STATE_LABELED = new Set<SessionStateKind>(["cancelled", "closed", "blocked", "full"]);

/** Estado de la salida (la misma regla que Hoy) o, si se vende con normalidad, su aviso. */
export function SessionStatus({ session, className }: { session: CalendarSession; className?: string }) {
  const state = calendarState(session);
  if (STATE_LABELED.has(state.kind)) {
    return (
      <Pill tone={state.tone === "warn" ? "warn" : "neutral"} className={cn(STATE_PILL_CLASS[state.tone], className)}>
        {state.label}
      </Pill>
    );
  }
  if (session.status !== "cancelled" && session.booked > 0 && session.unstaffed) {
    return <Pill className={cn("bg-danger-soft text-danger", className)}>Sin equipo</Pill>;
  }
  if (session.status !== "cancelled" && session.booked > 0 && session.booked < session.product.minPax) return <Pill tone="warn" className={className}>Bajo mín.</Pill>;
  if (state.kind === "few") return <Pill tone="warn" className={className}>{state.label}</Pill>;
  return null;
}

export function calendarState(session: CalendarSession) {
  return sessionState({ ...session, started: session.past });
}

/**
 * Semáforo de plazas (como Bokun): verde = hay sitio, ámbar = quedan pocas, rojo = completa,
 * gris = no se vende (cerrada, sin recurso, cancelada o ya salió).
 */
export const SEAT_TONES = [
  { label: "Hay plazas", className: "bg-ok" },
  { label: "Quedan pocas", className: "bg-[#ff9f0a]" },
  { label: "Completa", className: "bg-danger" },
  { label: "No se vende", className: "bg-[#c7c7cc]" },
] as const;

export function seatToneClass(kind: SessionStateKind): string {
  if (kind === "available" || kind === "panel_only") return SEAT_TONES[0].className;
  if (kind === "few") return SEAT_TONES[1].className;
  if (kind === "full") return SEAT_TONES[2].className;
  return SEAT_TONES[3].className;
}

/** Leyenda del semáforo, bajo el calendario. */
export function SeatLegend() {
  return (
    <ul aria-label="Leyenda de plazas" className="flex flex-wrap gap-x-4 gap-y-1 text-[0.78rem] text-muted-foreground">
      {SEAT_TONES.map((tone) => (
        <li key={tone.label} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={`h-[5px] w-4 rounded-full ${tone.className}`} />
          {tone.label}
        </li>
      ))}
    </ul>
  );
}
