import { addDays, addMonths, format, isValid, parseISO, startOfISOWeek } from "date-fns";
import { enGB, es } from "date-fns/locale";

import type { Locale } from "./i18n";
import { webText } from "./web-text";

/** Web pública de reservas: qué salidas se venden y cómo se recorre el calendario de la ficha. */

export type WebSession = {
  id: string;
  /** Fecha y hora en Canarias. */
  date: string;
  time: string;
  language: string;
  status: "open" | "closed" | "cancelled";
  startsAt: Date;
  free: number;
};

/**
 * ¿La web vende esta salida? Igual que create_booking_hold con canal web: abierta, con plazas y
 * que empiece después de `cutoffHours` horas desde ahora (cierre de venta online).
 */
export function isWebBookable(
  session: Pick<WebSession, "status" | "startsAt" | "free">,
  now: Date,
  cutoffHours: number,
): boolean {
  return (
    session.status === "open" &&
    session.free > 0 &&
    session.startsAt.getTime() > now.getTime() &&
    session.startsAt.getTime() >= now.getTime() + cutoffHours * 3_600_000
  );
}

/** Salidas a la venta agrupadas por día, en orden de fecha y hora. */
export function bookableDays<T extends Pick<WebSession, "date" | "time">>(sessions: readonly T[]): Map<string, T[]> {
  const sorted = [...sessions].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const days = new Map<string, T[]>();
  for (const session of sorted) days.set(session.date, [...(days.get(session.date) ?? []), session]);
  return days;
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export type StorefrontSelection = {
  /** Mes que se ve, «2026-11». */
  month: string;
  /** Día elegido, solo si tiene salidas a la venta. */
  date: string | null;
  /** Salida elegida, solo si es de ese día. */
  sessionId: string | null;
};

/**
 * Lee `?mes=2026-11&fecha=2026-11-14&salida=<id>` de la ficha. Lo que no sea válido o ya no se
 * venda se ignora. El mes va de `today` al último mes con salidas; sin mes, el de la fecha
 * elegida o el del primer día con salidas.
 */
export function parseStorefrontParams(
  search: Record<string, string | string[] | undefined>,
  days: ReadonlyMap<string, readonly { id: string }[]>,
  today: string,
): StorefrontSelection {
  const rawDate = first(search.fecha);
  const date = rawDate && DAY.test(rawDate) && days.has(rawDate) ? rawDate : null;
  const rawSession = first(search.salida);
  const sessionId =
    date && rawSession && UUID.test(rawSession)
      ? (days.get(date)?.find((session) => session.id === rawSession.toLowerCase())?.id ?? null)
      : null;

  const minMonth = today.slice(0, 7);
  const dayKeys = [...days.keys()].sort();
  const lastDay = dayKeys[dayKeys.length - 1];
  const maxMonth = lastDay && lastDay.slice(0, 7) > minMonth ? lastDay.slice(0, 7) : minMonth;
  const rawMonth = first(search.mes);
  let month = date?.slice(0, 7) ?? dayKeys[0]?.slice(0, 7) ?? minMonth;
  if (rawMonth && MONTH.test(rawMonth)) month = rawMonth;
  if (month < minMonth) month = minMonth;
  if (month > maxMonth) month = maxMonth;
  return { month, date, sessionId };
}

/** Semanas del mes (de lunes a domingo); null en los huecos de otros meses. */
export function monthGrid(month: string): (string | null)[][] {
  const firstDay = parseISO(`${month}-01`);
  const start = startOfISOWeek(firstDay);
  const weeks: (string | null)[][] = [];
  for (let week = 0; week < 6; week++) {
    const days: (string | null)[] = [];
    for (let weekday = 0; weekday < 7; weekday++) {
      const day = format(addDays(start, week * 7 + weekday), "yyyy-MM-dd");
      days.push(day.startsWith(month) ? day : null);
    }
    if (days.some(Boolean)) weeks.push(days);
  }
  return weeks;
}

/** Mes anterior (-1) o siguiente (1). */
export function shiftMonth(month: string, direction: -1 | 1): string {
  return format(addMonths(parseISO(`${month}-01`), direction), "yyyy-MM");
}

/** «noviembre de 2026» / «November 2026». */
export function monthTitle(month: string, locale: Locale = "es"): string {
  const date = parseISO(`${month}-01`);
  if (!isValid(date)) return month;
  return locale === "en" ? format(date, "LLLL yyyy", { locale: enGB }) : format(date, "LLLL 'de' yyyy", { locale: es });
}

/** ¿Puede ser el slug de un producto? (como los crea slugify) */
export function isSlug(value: string): boolean {
  return value.length <= 100 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value);
}

/** URL de la ficha con el mes, el día y la salida que se indiquen. */
export function storefrontHref(
  slug: string,
  selection: { month?: string; date?: string | null; sessionId?: string | null },
): string {
  const search = new URLSearchParams();
  if (selection.month) search.set("mes", selection.month);
  if (selection.date) search.set("fecha", selection.date);
  if (selection.sessionId) search.set("salida", selection.sessionId);
  const query = search.toString();
  return `/experiencias/${slug}${query ? `?${query}` : ""}`;
}

/** Plazas libres como en el prototipo: aviso cuando quedan 5 o menos. */
export function seatsLeftLabel(free: number, locale: Locale = "es"): { text: string; low: boolean } {
  const text = webText(locale);
  if (free <= 5) return { text: text.seatsLeft(free), low: true };
  return { text: text.seats(free), low: false };
}

/** Idiomas distintos de las reglas de horario, en el orden en que aparecen. */
export function distinctLanguages(languages: readonly string[]): string[] {
  return [...new Set(languages)];
}

/** Entradas elegidas → «id:2,id:1» para la URL del pago (sin las que están a 0). */
export function ticketsParam(quantities: Readonly<Record<string, number>>): string {
  return Object.entries(quantities)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => `${id}:${qty}`)
    .join(",");
}

/** «id:2,id:1» → líneas. null si algo no es válido (ids repetidos, cantidades fuera de 1-100). */
export function parseTicketsParam(raw: string | undefined): { ticketTypeId: string; qty: number }[] | null {
  if (!raw) return null;
  const lines: { ticketTypeId: string; qty: number }[] = [];
  for (const part of raw.split(",")) {
    const [id, qtyText, extra] = part.split(":");
    if (extra !== undefined || !id || !UUID.test(id) || !qtyText || !/^\d{1,3}$/.test(qtyText)) return null;
    const qty = Number(qtyText);
    const ticketTypeId = id.toLowerCase();
    if (qty < 1 || qty > 100 || lines.some((line) => line.ticketTypeId === ticketTypeId)) return null;
    lines.push({ ticketTypeId, qty });
  }
  return lines.length && lines.length <= 20 ? lines : null;
}
