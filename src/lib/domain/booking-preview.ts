/**
 * Vista previa lateral de una reserva desde el listado: qué fila va antes o después, cuándo hay que
 * volver a cargarla y si un clic debe abrirla o seguir el enlace a la ficha.
 */

export const BOOKING_CODE = /^VT[0-9A-Z]{6}$/;

/** Movimientos del día que se enseñan en la vista previa; el resto, en la ficha. */
export const PREVIEW_EVENTS = 3;

/**
 * Huella de lo que cambia al actuar desde la vista previa (check-in, cobro, cambio de entradas).
 * Si la fila del listado trae otra huella, la vista previa se vuelve a cargar.
 */
export function previewStamp(row: {
  status: string;
  paymentStatus: string;
  checkedIn: boolean;
  totalCents: number;
  paidCents: number;
}): string {
  return [row.status, row.paymentStatus, row.checkedIn ? 1 : 0, row.totalCents, row.paidCents].join("|");
}

/** Código de la reserva anterior (-1) o siguiente (+1) del listado; null en los extremos o si ya no está. */
export function adjacentCode(codes: readonly string[], current: string, step: -1 | 1): string | null {
  const index = codes.indexOf(current);
  if (index < 0) return null;
  return codes[index + step] ?? null;
}

/** Posición «3 de 25» para la barra de la vista previa. */
export function positionLabel(codes: readonly string[], current: string): string | null {
  const index = codes.indexOf(current);
  return index < 0 ? null : `${index + 1} de ${codes.length}`;
}

/**
 * Un clic normal abre la vista previa; con Ctrl, Cmd, Mayús o Alt, o con otro botón, el enlace
 * sigue haciendo lo de siempre (abrir la ficha en otra pestaña o ventana).
 */
export function opensPreview(event: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/** Teclas para pasar de reserva sin cerrar la vista previa: flechas o j/k como en el correo. */
export function previewStep(key: string): -1 | 1 | null {
  if (key === "ArrowDown" || key === "j") return 1;
  if (key === "ArrowUp" || key === "k") return -1;
  return null;
}

/** Los últimos movimientos, del más reciente al más antiguo. */
export function latestEvents<T extends { at: string; id: string }>(events: readonly T[], count = PREVIEW_EVENTS): T[] {
  return [...events].sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id)).slice(0, count);
}
