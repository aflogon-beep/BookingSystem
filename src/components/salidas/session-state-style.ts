import type { SessionState, SessionStateTone } from "@/lib/domain/session-state";

/** Color del estado de una salida en texto: gris, naranja o azul. */
export const STATE_TEXT_CLASS: Record<SessionStateTone, string> = {
  normal: "",
  muted: "text-faint",
  warn: "font-semibold text-warn",
  blue: "font-semibold text-primary-dark",
};

/** Color del estado de una salida en etiqueta («Pill»). */
export const STATE_PILL_CLASS: Record<SessionStateTone, string> = {
  normal: "",
  muted: "",
  warn: "bg-warn-soft text-warn",
  blue: "bg-primary-soft text-primary-dark",
};

/** Por qué no se puede reservar (o solo desde el panel), para el título del botón. */
export function stateHint(state: SessionState): string | undefined {
  switch (state.kind) {
    case "blocked":
      return `${state.label}: no queda ninguno libre para esta salida`;
    case "full":
      return "No quedan plazas";
    case "closed":
      return "Cerrada a la venta desde el manifiesto";
    case "cancelled":
      return "Salida cancelada";
    case "departed":
    case "in_progress":
      return "Ya ha salido";
    default:
      return state.webBookable ? undefined : "Ya no se vende en la web: solo se reserva desde el panel";
  }
}
