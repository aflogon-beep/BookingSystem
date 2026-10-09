import { TZDate } from "@date-fns/tz";
import { addDays, addMonths, differenceInCalendarDays, endOfMonth, format, isValid, parseISO, startOfISOWeek, startOfMonth } from "date-fns";
import { es } from "date-fns/locale";

import { BUSINESS_TIMEZONE, localToInstant } from "@/lib/domain/schedule";

export type CalendarView = "semana" | "mes";

export type CalendarParams = { view: CalendarView; anchor: string; productId: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ymd = (date: Date) => format(date, "yyyy-MM-dd");

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Lee la URL del calendario (?vista=mes&fecha=2026-10-14&producto=…). Lo que no sea válido se
 * ignora: semana por defecto, hoy por defecto y todos los productos.
 */
export function parseCalendarParams(
  search: Record<string, string | string[] | undefined>,
  today: string,
): CalendarParams {
  const view = first(search.vista) === "mes" ? "mes" : "semana";
  const rawDate = first(search.fecha);
  const parsed = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? parseISO(rawDate) : null;
  const anchor = parsed && isValid(parsed) && ymd(parsed) === rawDate ? rawDate : today;
  const rawProduct = first(search.producto);
  return { view, anchor, productId: rawProduct && UUID.test(rawProduct) ? rawProduct.toLowerCase() : null };
}

/** Días que se ven: la semana (lunes a domingo) o el mes completo en semanas enteras. */
export function visibleDays(view: CalendarView, anchor: string): string[] {
  const date = parseISO(anchor);
  const start = view === "semana" ? startOfISOWeek(date) : startOfISOWeek(startOfMonth(date));
  const end = view === "semana" ? addDays(start, 6) : addDays(startOfISOWeek(endOfMonth(date)), 6);
  return Array.from({ length: differenceInCalendarDays(end, start) + 1 }, (_, index) => ymd(addDays(start, index)));
}

/** Fecha a la que llevan «anterior» (-1) y «siguiente» (1). */
export function shiftAnchor(view: CalendarView, anchor: string, direction: -1 | 1): string {
  const date = parseISO(anchor);
  return ymd(view === "semana" ? addDays(date, 7 * direction) : startOfMonth(addMonths(date, direction)));
}

/** Instantes [desde, hasta) que cubren los días visibles en hora de Canarias, para la consulta. */
export function rangeForDays(days: readonly string[]): { from: string; to: string } {
  const firstDay = days[0] ?? "";
  const lastDay = days[days.length - 1] ?? firstDay;
  return {
    from: localToInstant(firstDay, "00:00").toISOString(),
    to: localToInstant(ymd(addDays(parseISO(lastDay), 1)), "00:00").toISOString(),
  };
}

/** Instante → fecha y hora locales del negocio: «2026-10-14», «16:30». */
export function toBusinessDateTime(instant: string): { date: string; time: string } {
  const local = new TZDate(new Date(instant).getTime(), BUSINESS_TIMEZONE);
  return { date: format(local, "yyyy-MM-dd"), time: format(local, "HH:mm") };
}

/** «13 oct – 19 oct» para la semana; «octubre de 2026» para el mes. */
export function calendarTitle(view: CalendarView, anchor: string): string {
  if (view === "mes") return format(parseISO(anchor), "LLLL 'de' yyyy", { locale: es });
  const days = visibleDays("semana", anchor);
  const label = (day: string) => format(parseISO(day), "d MMM", { locale: es }).replace(".", "");
  return `${label(days[0] ?? anchor)} – ${label(days[6] ?? anchor)}`;
}

/** Cabecera de columna de la semana: «lun 13». */
export function weekdayLabel(day: string): string {
  return format(parseISO(day), "EEE d", { locale: es }).replace(".", "");
}

/** Nivel de ocupación de un día, como el prototipo: 0 sin plazas vendidas … 4 casi completo. */
export function occupancyLevel(booked: number, capacity: number): 0 | 1 | 2 | 3 | 4 {
  if (capacity <= 0 || booked <= 0) return 0;
  const ratio = booked / capacity;
  if (ratio >= 0.95) return 4;
  if (ratio >= 0.6) return 3;
  if (ratio >= 0.3) return 2;
  return 1;
}

export function groupByDate<T extends { date: string }>(items: readonly T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(item.date, [...(groups.get(item.date) ?? []), item]);
  return groups;
}

/** URL del calendario. Sin fecha lleva a hoy; la vista semana y «todos los productos» no se escriben. */
export function calendarHref(params: { view: CalendarView; anchor?: string; productId: string | null }): string {
  const search = new URLSearchParams();
  if (params.view === "mes") search.set("vista", "mes");
  if (params.anchor) search.set("fecha", params.anchor);
  if (params.productId) search.set("producto", params.productId);
  const query = search.toString();
  return query ? `/panel/calendario?${query}` : "/panel/calendario";
}

/** Suma de plazas vendidas y aforo, sin contar las salidas canceladas. */
export function occupancyTotals(sessions: readonly { booked: number; capacity: number; status: string }[]): {
  booked: number;
  capacity: number;
} {
  const live = sessions.filter((session) => session.status !== "cancelled");
  return {
    booked: live.reduce((sum, session) => sum + session.booked, 0),
    capacity: live.reduce((sum, session) => sum + session.capacity, 0),
  };
}

/** «miércoles 14 de octubre». */
export function longDayLabel(day: string): string {
  return format(parseISO(day), "EEEE d 'de' MMMM", { locale: es });
}
