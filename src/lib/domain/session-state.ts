import { RESOURCE_TYPE_TEXT, type ResourceType } from "@/lib/domain/resources";

/** A partir de cuántas plazas libres se avisa «Quedan N». */
export const FEW_SEATS = 3;

/** «Sin guía libre»: su recurso obligatorio está en otra salida a esa hora. */
export function blockedText(need: ResourceType): string {
  return `Sin ${RESOURCE_TYPE_TEXT[need].singular} libre`;
}

export type SessionStateInput = {
  status: string;
  /** Ya ha empezado. */
  started: boolean;
  /** Ya ha terminado. Si no se sabe, una salida empezada cuenta como «Ya salió». */
  ended?: boolean;
  capacity: number;
  booked: number;
  /** Recurso obligatorio que no está libre a esa hora (vista session_team_status). */
  blockingNeed?: ResourceType | null;
  /** Se vende en la web: producto a la venta y antes del cierre de venta online. Por defecto, sí. */
  webOpen?: boolean;
};

export type SessionStateKind =
  | "cancelled"
  | "departed"
  | "in_progress"
  | "closed"
  | "blocked"
  | "full"
  | "few"
  | "panel_only"
  | "available";

/** Gris: no se vende por decisión o porque ya pasó. Naranja: problema que se puede resolver. Azul: completa. */
export type SessionStateTone = "muted" | "warn" | "blue" | "normal";

export type SessionState = {
  kind: SessionStateKind;
  /** Lo que se lee en lugar de «N libres»: «Sin guía libre», «Cerrada», «Completa»… */
  label: string;
  tone: SessionStateTone;
  free: number;
  /** El equipo puede añadir reservas desde el panel. */
  panelBookable: boolean;
  /** Un cliente puede reservarla en la web. */
  webBookable: boolean;
};

/**
 * Estado de una salida, la misma regla para Hoy, Calendario, manifiesto y nueva reserva. Si hay
 * varios motivos gana el primero: cancelada, ya salió / en ruta, cerrada, sin recurso libre,
 * completa, quedan pocas, solo panel.
 */
export function sessionState(session: SessionStateInput): SessionState {
  const free = Math.max(session.capacity - session.booked, 0);
  const closedState = (kind: SessionStateKind, label: string, tone: SessionStateTone): SessionState => ({
    kind,
    label,
    tone,
    free,
    panelBookable: false,
    webBookable: false,
  });

  if (session.status === "cancelled") return closedState("cancelled", "Cancelada", "muted");
  if (session.started) {
    return session.ended === false ? closedState("in_progress", "En ruta", "muted") : closedState("departed", "Ya salió", "muted");
  }
  if (session.status !== "open") return closedState("closed", "Cerrada", "muted");
  if (session.blockingNeed) return closedState("blocked", blockedText(session.blockingNeed), "warn");
  if (free === 0) return closedState("full", "Completa", "blue");

  const webOpen = session.webOpen ?? true;
  const suffix = webOpen ? "" : " · solo panel";
  if (free <= FEW_SEATS && session.booked > 0) {
    return { kind: "few", label: `Quedan ${free}${suffix}`, tone: "warn", free, panelBookable: true, webBookable: webOpen };
  }
  return {
    kind: webOpen ? "available" : "panel_only",
    label: `${free} libres${suffix}`,
    tone: "normal",
    free,
    panelBookable: true,
    webBookable: webOpen,
  };
}

/** Se vende en la web: producto a la venta y la salida empieza después del cierre de venta online. */
export function webSalesOpen(startsAt: string | Date, productActive: boolean, cutoffHours: number, now: Date): boolean {
  return productActive && new Date(startsAt).getTime() >= now.getTime() + cutoffHours * 3_600_000;
}

export type BusyResource = { name: string; productName: string; time: string; endTime: string };

/**
 * Por qué una salida no tiene su recurso obligatorio libre, para el manifiesto: quién lo ocupa y
 * dónde («Lukas está en la Ruta de senderismo de 09:00 a 11:00») o, si nadie lo ocupa, que ninguno
 * habla el idioma de la salida.
 */
export function blockedReason(need: ResourceType, busy: readonly BusyResource[], languageName: string): string {
  if (!busy.length) {
    return need === "guide"
      ? `Ningún guía libre habla ${languageName.toLowerCase()}.`
      : `No queda ningún ${RESOURCE_TYPE_TEXT[need].singular} libre para esta salida.`;
  }
  const where = busy.map((item) => `${item.name} está en ${item.productName} de ${item.time} a ${item.endTime}`);
  return `${where.join("; ")}.`;
}
