import { format, getISODay, parseISO } from "date-fns";
import { es } from "date-fns/locale";

import { bookingListQuery, type BookingListParams, type ListFilter } from "@/lib/domain/booking-list";
import { toBusinessDateTime } from "@/lib/domain/calendar";
import { WEEKDAY_INITIALS } from "@/lib/domain/schedule";
import { shiftDay } from "@/lib/domain/today";

/** Días que enseña el «pulso» de Reservas (dos semanas). */
export const PULSE_DAYS = 14;

/**
 * Días del gráfico. Por defecto, hoy y los 13 siguientes; en «Pasadas», los 14 que acaban hoy.
 * Si el filtro de fechas cae fuera de esa ventana, la ventana se va a él (empieza en «desde» o
 * acaba en «hasta»). Pulsar un día de la ventana no la mueve.
 */
export function pulseWindow(params: Pick<BookingListParams, "tab" | "from" | "to">, today: string): string[] {
  let start = params.tab === "pasadas" ? shiftDay(today, -(PULSE_DAYS - 1)) : today;
  const end = shiftDay(start, PULSE_DAYS - 1);
  if (params.from && (params.from < start || params.from > end)) start = params.from;
  else if (!params.from && params.to && (params.to < start || params.to > end)) start = shiftDay(params.to, -(PULSE_DAYS - 1));
  return Array.from({ length: PULSE_DAYS }, (_, index) => shiftDay(start, index));
}

/** El pulso no tiene sentido con las canceladas (no llevan pasajeros). */
export const showsPulse = (params: Pick<BookingListParams, "tab">) => params.tab !== "canceladas";

/**
 * Filtros de la consulta del gráfico: los mismos de búsqueda, producto y canal que el listado,
 * sin canceladas y solo en los días de la ventana. En «Pago pendiente» solo cuenta lo pendiente.
 */
export function pulseFilters(params: BookingListParams, days: readonly string[], now: Date): ListFilter[] {
  const { filters } = bookingListQuery(
    { ...params, tab: params.tab === "pendientes" ? "pendientes" : "todas", from: days[0] ?? null, to: days[days.length - 1] ?? null },
    now,
  );
  return params.tab === "pendientes" ? filters : [...filters, { column: "status", operator: "neq", value: "cancelled" }];
}

/** Una fila de la consulta agregada: reservas y pasajeros de un producto en una salida. */
export type PulseRow = { startsAt: string; productName: string; productColor: string; bookings: number; pax: number };

export type PulseSegment = { name: string; color: string; pax: number };

export type PulseDay = {
  date: string;
  pax: number;
  bookings: number;
  /** Pasajeros por producto, en el mismo orden todos los días (para que los colores no bailen). */
  segments: PulseSegment[];
};

export type Pulse = {
  days: PulseDay[];
  maxPax: number;
  totalPax: number;
  totalBookings: number;
  /** Productos que aparecen en la ventana, de más a menos pasajeros. */
  legend: { name: string; color: string }[];
  /** Día con más pasajeros (si hay alguno). */
  busiest: string | null;
};

/** Agrupa las salidas por día (en hora de Canarias) y por producto. */
export function buildPulse(rows: readonly PulseRow[], days: readonly string[]): Pulse {
  const byDay = new Map(days.map((date) => [date, new Map<string, PulseSegment & { bookings: number }>()]));
  const productPax = new Map<string, { color: string; pax: number }>();
  for (const row of rows) {
    const products = byDay.get(toBusinessDateTime(row.startsAt).date);
    if (!products || row.pax <= 0) continue;
    const current = products.get(row.productName) ?? { name: row.productName, color: row.productColor, pax: 0, bookings: 0 };
    current.pax += row.pax;
    current.bookings += row.bookings;
    products.set(row.productName, current);
    const total = productPax.get(row.productName) ?? { color: row.productColor, pax: 0 };
    total.pax += row.pax;
    productPax.set(row.productName, total);
  }
  const legend = [...productPax.entries()]
    .sort(([nameA, a], [nameB, b]) => b.pax - a.pax || nameA.localeCompare(nameB, "es"))
    .map(([name, { color }]) => ({ name, color }));
  const order = new Map(legend.map((product, index) => [product.name, index]));
  const pulseDays = days.map((date) => {
    const segments = [...(byDay.get(date)?.values() ?? [])].sort((a, b) => (order.get(a.name) ?? 0) - (order.get(b.name) ?? 0));
    return {
      date,
      pax: segments.reduce((sum, segment) => sum + segment.pax, 0),
      bookings: segments.reduce((sum, segment) => sum + segment.bookings, 0),
      segments: segments.map(({ name, color, pax }) => ({ name, color, pax })),
    };
  });
  const maxPax = Math.max(0, ...pulseDays.map((day) => day.pax));
  return {
    days: pulseDays,
    maxPax,
    totalPax: pulseDays.reduce((sum, day) => sum + day.pax, 0),
    totalBookings: pulseDays.reduce((sum, day) => sum + day.bookings, 0),
    legend,
    busiest: maxPax > 0 ? (pulseDays.find((day) => day.pax === maxPax)?.date ?? null) : null,
  };
}

/** El día está elegido en el listado (solo ese día, o la pestaña «Hoy» sin fechas). */
export function isPulseDaySelected(params: Pick<BookingListParams, "tab" | "from" | "to">, day: string, today: string): boolean {
  if (params.from || params.to) return params.from === day && params.to === day;
  return params.tab === "hoy" && day === today;
}

/**
 * Filtros del listado al pulsar un día: solo ese día, en la pestaña que le toca (hoy, próximas o
 * pasadas; «Pago pendiente» se mantiene). Pulsar el día ya elegido lo quita.
 */
export function pulseDayParams(params: BookingListParams, day: string, today: string): BookingListParams {
  if (isPulseDaySelected(params, day, today)) {
    return { ...params, tab: params.tab === "hoy" ? "proximas" : params.tab, from: null, to: null };
  }
  const tab = params.tab === "pendientes" ? "pendientes" : day === today ? "hoy" : day > today ? "proximas" : "pasadas";
  return { ...params, tab, from: day, to: day };
}

/** Altura de una barra (porcentaje del día con más pasajeros); un día con alguien nunca baja del 6 %. */
export function barPercent(pax: number, maxPax: number): number {
  if (pax <= 0 || maxPax <= 0) return 0;
  return Math.max(6, Math.round((pax / maxPax) * 100));
}

/** Etiqueta corta del eje: «L 12», «M 13». */
export function pulseAxisLabel(day: string): { weekday: string; dayOfMonth: string } {
  const date = parseISO(day);
  return { weekday: WEEKDAY_INITIALS[getISODay(date) - 1] ?? "", dayOfMonth: format(date, "d") };
}

/** Cabecera de cada día del listado: «Hoy», «Mañana», «Ayer» o «sábado 17 oct». */
export function dayGroupLabel(day: string, today: string): { title: string; detail: string } {
  const detail = format(parseISO(day), "EEEE d MMM", { locale: es }).replaceAll(".", "");
  if (day === today) return { title: "Hoy", detail };
  if (day === shiftDay(today, 1)) return { title: "Mañana", detail };
  if (day === shiftDay(today, -1)) return { title: "Ayer", detail };
  return { title: detail, detail: "" };
}

export type DayGroup<T> = { date: string; rows: T[]; bookings: number; pax: number; totalCents: number };

/**
 * Agrupa las filas del listado (ya ordenadas por salida) por día, en el orden en que llegan. Pasajeros
 * e importe solo cuentan las no canceladas, como los totales de la cabecera.
 */
export function groupByDay<T extends { date: string; status: string; pax: number; totalCents: number }>(rows: readonly T[]): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  for (const row of rows) {
    let group = groups[groups.length - 1];
    if (!group || group.date !== row.date) {
      group = { date: row.date, rows: [], bookings: 0, pax: 0, totalCents: 0 };
      groups.push(group);
    }
    group.rows.push(row);
    group.bookings += 1;
    if (row.status !== "cancelled") {
      group.pax += row.pax;
      group.totalCents += row.totalCents;
    }
  }
  return groups;
}

/** Parte cobrada del importe, en porcentaje entero (0–100). */
export function collectedPercent(collectedCents: number, totalCents: number): number {
  if (totalCents <= 0) return collectedCents > 0 ? 100 : 0;
  return Math.min(100, Math.max(0, Math.round((collectedCents / totalCents) * 100)));
}
