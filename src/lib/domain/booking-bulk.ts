/**
 * Acciones en bloque del listado de reservas: qué se puede hacer con las reservas marcadas y cómo
 * se cuenta el resultado.
 */

/** Máximo de reservas por acción en bloque (lo que cabe en una página del listado y algo más). */
export const BULK_LIMIT = 200;

export type BulkRow = {
  id: string;
  code: string;
  status: string;
  paymentStatus: string;
  checkedIn: boolean;
  pax: number;
  totalCents: number;
  paidCents: number;
};

export type BulkSummary = {
  count: number;
  pax: number;
  totalCents: number;
  /** Confirmadas sin check-in: las que pasan a «Presentado». */
  checkInIds: string[];
  /** Confirmadas con el pago pendiente: las que se pueden cobrar. */
  collectIds: string[];
  collectCents: number;
};

/** Resumen de lo marcado. Las canceladas cuentan como marcadas, pero no suman ni admiten acciones. */
export function bulkSummary(rows: readonly BulkRow[], selected: ReadonlySet<string>): BulkSummary {
  const picked = rows.filter((row) => selected.has(row.code));
  const live = picked.filter((row) => row.status !== "cancelled" && row.status !== "expired");
  const confirmed = live.filter((row) => row.status === "confirmed");
  const collect = confirmed.filter((row) => row.paymentStatus === "pending");
  return {
    count: picked.length,
    pax: live.reduce((sum, row) => sum + row.pax, 0),
    totalCents: live.reduce((sum, row) => sum + row.totalCents, 0),
    checkInIds: confirmed.filter((row) => !row.checkedIn).map((row) => row.id),
    collectIds: collect.map((row) => row.id),
    collectCents: collect.reduce((sum, row) => sum + Math.max(row.totalCents - row.paidCents, 0), 0),
  };
}

/** Marca o desmarca un grupo (un día entero): si ya están todas, se quitan; si no, se añaden. */
export function toggleGroup(selected: ReadonlySet<string>, codes: readonly string[]): Set<string> {
  const next = new Set(selected);
  const all = codes.length > 0 && codes.every((code) => next.has(code));
  for (const code of codes) {
    if (all) next.delete(code);
    else next.add(code);
  }
  return next;
}

/** Estado de la casilla de un grupo: todas, ninguna o algunas. */
export function groupState(selected: ReadonlySet<string>, codes: readonly string[]): boolean | "mixed" {
  const marked = codes.filter((code) => selected.has(code)).length;
  if (marked === 0) return false;
  return marked === codes.length ? true : "mixed";
}

/** Se quitan las que ya no están en el listado (tras cambiar un filtro o de pestaña). */
export function pruneSelection(selected: ReadonlySet<string>, codes: readonly string[]): Set<string> {
  const visible = new Set(codes);
  return new Set([...selected].filter((code) => visible.has(code)));
}

/** «3 reservas», «1 reserva». */
export function bookingsLabel(count: number): string {
  return `${count} ${count === 1 ? "reserva" : "reservas"}`;
}

/** Texto del aviso tras una acción en bloque: «3 reservas con check-in» o con las que fallaron. */
export function bulkResultMessage(done: number, failed: number, verb: { one: string; many: string }): string {
  const ok = `${bookingsLabel(done)} ${done === 1 ? verb.one : verb.many}`;
  if (!failed) return ok;
  return done ? `${ok}; ${failed} no ${failed === 1 ? "se pudo" : "se pudieron"} cambiar` : "No se pudo cambiar ninguna reserva";
}
