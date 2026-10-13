import { addDays, format, parseISO } from "date-fns";
import { z } from "zod";

import { CHANNEL_LABELS } from "@/lib/domain/booking-detail";
import { LANGUAGES, isLanguageCode } from "@/lib/domain/settings";

/** Días que abarca cada informe. */
export const REPORT_DAYS = 30;

export const REPORT_PERIODS = [
  { value: "pasados", label: "Últimos 30 días" },
  { value: "futuros", label: "Próximos 30 días" },
] as const;

export type ReportPeriod = (typeof REPORT_PERIODS)[number]["value"];

/** Periodo desde la URL (?periodo=pasados|futuros); por defecto, los últimos 30 días, como el prototipo. */
export function parseReportPeriod(raw: string | string[] | undefined): ReportPeriod {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return REPORT_PERIODS.find((period) => period.value === value)?.value ?? "pasados";
}

/** Días del informe (incluidos), en la hora del negocio: hoy y los 29 anteriores, o hoy y los 29 siguientes. */
export function reportRange(period: ReportPeriod, today: string): { from: string; to: string; days: string[] } {
  const start = period === "pasados" ? addDays(parseISO(today), -(REPORT_DAYS - 1)) : parseISO(today);
  const days = Array.from({ length: REPORT_DAYS }, (_, index) => format(addDays(start, index), "yyyy-MM-dd"));
  return { from: days[0] ?? today, to: days[days.length - 1] ?? today, days };
}

const count = z.number().int().nonnegative();

/** Lo que devuelve report_summary (se valida: viene de la BD como JSON). */
export const reportSummarySchema = z.object({
  bookings: count,
  revenue_cents: count,
  pax: count,
  capacity: count,
  booked_seats: count,
  days: z.array(z.object({ day: z.string(), revenue_cents: count })),
  products: z.array(
    z.object({ id: z.string(), name: z.string(), color: z.string(), revenue_cents: count, capacity: count, booked_seats: count }),
  ),
  channels: z.array(z.object({ channel: z.string(), revenue_cents: count })),
  languages: z.array(z.object({ language: z.string(), pax: count })),
});

export type ReportSummary = z.infer<typeof reportSummarySchema>;

/** Canales en el orden y con los colores del prototipo. */
const CHANNEL_COLORS = [
  { channel: "web", color: "#0071E3" },
  { channel: "desk", color: "#34C759" },
  { channel: "phone", color: "#FF9F0A" },
  { channel: "agency", color: "#AF52DE" },
] as const;

export type Report = {
  kpis: {
    revenueCents: number;
    bookings: number;
    pax: number;
    /** Pasajeros por reserva con un decimal y coma: «2,3». */
    paxPerBooking: string;
    avgTicketCents: number;
    occupancyPercent: number;
    bookedSeats: number;
    capacity: number;
  };
  days: { day: string; revenueCents: number; heightPercent: number; future: boolean }[];
  /** Valor de la parte de arriba del gráfico, redondeado a euros «bonitos». */
  chartTopCents: number;
  products: { id: string; name: string; color: string; revenueCents: number; widthPercent: number; occupancyPercent: number }[];
  channels: { channel: string; label: string; color: string; revenueCents: number; sharePercent: number }[];
  languages: { language: string; label: string; pax: number; widthPercent: number }[];
};

/** Paso «bonito» del eje (en euros), como niceStep del prototipo: la mitad de 1, 2, 5 o 10 × 10ⁿ. */
export function niceStep(euros: number): number {
  const power = Math.pow(10, Math.floor(Math.log10(Math.max(euros, 1))));
  const n = euros / power;
  return ((n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * power) / 2;
}

/** Tope del gráfico en céntimos: el máximo redondeado hacia arriba a un múltiplo del paso (100 € si no hay nada). */
export function chartTop(maxCents: number): number {
  const euros = maxCents / 100;
  const step = niceStep(euros);
  return Math.ceil(euros / step) * step * 100 || 10_000;
}

const percent = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

/** Indicadores y series de la pantalla Informes a partir del resumen de la BD. */
export function buildReport(summary: ReportSummary, days: readonly string[], today: string): Report {
  const byDay = new Map(summary.days.map((row) => [row.day, row.revenue_cents]));
  const series = days.map((day) => ({ day, revenueCents: byDay.get(day) ?? 0, future: day > today }));
  const top = chartTop(Math.max(0, ...series.map((row) => row.revenueCents)));

  const products = [...summary.products].sort((a, b) => b.revenue_cents - a.revenue_cents || a.name.localeCompare(b.name, "es"));
  const maxProduct = Math.max(1, ...products.map((product) => product.revenue_cents));

  const channelRevenue = new Map(summary.channels.map((row) => [row.channel, row.revenue_cents]));
  // Solo los canales que se pintan, para que los porcentajes sumen 100.
  const channelTotal = CHANNEL_COLORS.reduce((sum, { channel }) => sum + (channelRevenue.get(channel) ?? 0), 0);

  const languages = summary.languages.filter((row) => row.pax > 0).sort((a, b) => b.pax - a.pax || a.language.localeCompare(b.language));
  const maxLanguage = Math.max(1, ...languages.map((row) => row.pax));

  return {
    kpis: {
      revenueCents: summary.revenue_cents,
      bookings: summary.bookings,
      pax: summary.pax,
      paxPerBooking: (summary.pax / Math.max(1, summary.bookings)).toFixed(1).replace(".", ","),
      avgTicketCents: summary.bookings ? Math.round(summary.revenue_cents / summary.bookings) : 0,
      occupancyPercent: Math.round(percent(summary.booked_seats, summary.capacity)),
      bookedSeats: summary.booked_seats,
      capacity: summary.capacity,
    },
    days: series.map((row) => ({ ...row, heightPercent: percent(row.revenueCents, top) })),
    chartTopCents: top,
    products: products.map((product) => ({
      id: product.id,
      name: product.name,
      color: product.color,
      revenueCents: product.revenue_cents,
      widthPercent: percent(product.revenue_cents, maxProduct),
      occupancyPercent: Math.round(percent(product.booked_seats, product.capacity)),
    })),
    channels: CHANNEL_COLORS.map(({ channel, color }) => {
      const revenueCents = channelRevenue.get(channel) ?? 0;
      return { channel, label: CHANNEL_LABELS[channel] ?? channel, color, revenueCents, sharePercent: percent(revenueCents, channelTotal) };
    }),
    languages: languages.map((row) => ({
      language: row.language,
      label: isLanguageCode(row.language) ? LANGUAGES[row.language] : row.language.toUpperCase(),
      pax: row.pax,
      widthPercent: percent(row.pax, maxLanguage),
    })),
  };
}

/** Importe redondeado a euros, sin céntimos («1.235 €»), para indicadores y ejes. */
export function roundToEuros(cents: number): number {
  return Math.round(cents / 100) * 100;
}

/** Los 30 días justo antes de un rango (para comparar los «últimos 30 días» con los anteriores). */
export function previousRange(range: { from: string }): { from: string; to: string } {
  const start = parseISO(range.from);
  return { from: format(addDays(start, -REPORT_DAYS), "yyyy-MM-dd"), to: format(addDays(start, -1), "yyyy-MM-dd") };
}

export type Delta = { text: string; direction: "up" | "down" | "flat" };

/** Variación en %: «+12 %», «−8 %», «=». Sin dato anterior: «nuevo» (o nada si los dos son 0). */
export function percentDelta(current: number, previous: number): Delta | null {
  if (previous <= 0) return current > 0 ? { text: "nuevo", direction: "up" } : null;
  const change = Math.round(((current - previous) / previous) * 100);
  if (change === 0) return { text: "=", direction: "flat" };
  return { text: `${change > 0 ? "+" : "−"}${Math.abs(change)} %`, direction: change > 0 ? "up" : "down" };
}

/** Variación en puntos (para la ocupación): «+4 pts», «−2 pts», «=». */
export function pointsDelta(current: number, previous: number): Delta {
  const change = Math.round(current - previous);
  if (change === 0) return { text: "=", direction: "flat" };
  return { text: `${change > 0 ? "+" : "−"}${Math.abs(change)} pts`, direction: change > 0 ? "up" : "down" };
}

/** Variación de cada indicador frente al periodo anterior. */
export function kpiDeltas(current: Report["kpis"], previous: Report["kpis"]) {
  return {
    revenue: percentDelta(current.revenueCents, previous.revenueCents),
    pax: percentDelta(current.pax, previous.pax),
    avgTicket: percentDelta(current.avgTicketCents, previous.avgTicketCents),
    occupancy: previous.capacity > 0 && current.capacity > 0 ? pointsDelta(current.occupancyPercent, previous.occupancyPercent) : null,
  };
}

export type PodiumEntry = { id: string; name: string; color: string; revenueCents: number; delta: Delta | null };

/**
 * Podio de productos: los tres que más ingresan (con ingresos) y su variación frente al periodo
 * anterior, si lo hay. «rising» es el que más crece (en %) entre los que ya vendían antes.
 */
export function productPodium(
  current: readonly Pick<Report["products"][number], "id" | "name" | "color" | "revenueCents">[],
  previous: readonly Pick<Report["products"][number], "id" | "revenueCents">[] | null,
): { podium: PodiumEntry[]; rising: (PodiumEntry & { growthPercent: number }) | null } {
  const before = new Map(previous?.map((product) => [product.id, product.revenueCents]));
  const ranked = current
    .filter((product) => product.revenueCents > 0)
    .map((product) => ({
      id: product.id,
      name: product.name,
      color: product.color,
      revenueCents: product.revenueCents,
      delta: previous ? percentDelta(product.revenueCents, before.get(product.id) ?? 0) : null,
    }))
    .sort((a, b) => b.revenueCents - a.revenueCents || a.name.localeCompare(b.name, "es"));
  let rising: (PodiumEntry & { growthPercent: number }) | null = null;
  if (previous) {
    for (const product of ranked) {
      const old = before.get(product.id) ?? 0;
      if (old <= 0) continue;
      const growthPercent = Math.round(((product.revenueCents - old) / old) * 100);
      if (growthPercent > 0 && (!rising || growthPercent > rising.growthPercent)) rising = { ...product, growthPercent };
    }
  }
  return { podium: ranked.slice(0, 3), rising };
}

/** Lo que devuelve report_heatmap: una fila por día de la semana (1 = lunes) y hora de salida. */
export const reportHeatmapSchema = z.array(
  z.object({ weekday: z.number().int().min(1).max(7), time: z.string(), sessions: count, capacity: count, booked_seats: count }),
);

export type ReportHeatmapRow = z.infer<typeof reportHeatmapSchema>[number];

export const WEEKDAY_LABELS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"] as const;

export type HeatCell = { weekday: number; time: string; sessions: number; occupancyPercent: number | null; level: 0 | 1 | 2 | 3 | 4 };

export type Heatmap = {
  times: string[];
  rows: { weekday: number; label: string; cells: HeatCell[] }[];
  /** Hueco con más ocupación y con menos (si hay al menos dos con salidas). */
  best: HeatCell | null;
  worst: HeatCell | null;
};

/** Intensidad del color: 1 hasta 25 %, 2 hasta 50 %, 3 hasta 75 % y 4 por encima; 0 sin salidas. */
export function heatLevel(percent: number | null): HeatCell["level"] {
  if (percent === null) return 0;
  if (percent < 25) return 1;
  if (percent < 50) return 2;
  if (percent < 75) return 3;
  return 4;
}

/** Cuadrícula de lunes a domingo × horas de salida, con la ocupación de cada hueco. */
export function buildHeatmap(rows: readonly ReportHeatmapRow[]): Heatmap {
  const times = [...new Set(rows.map((row) => row.time))].sort();
  const byKey = new Map(rows.map((row) => [`${row.weekday} ${row.time}`, row]));
  const grid = WEEKDAY_LABELS.map((label, index) => {
    const weekday = index + 1;
    return {
      weekday,
      label,
      cells: times.map((time): HeatCell => {
        const row = byKey.get(`${weekday} ${time}`);
        const occupancyPercent = row && row.capacity > 0 ? Math.round((row.booked_seats / row.capacity) * 100) : null;
        return { weekday, time, sessions: row?.sessions ?? 0, occupancyPercent, level: heatLevel(occupancyPercent) };
      }),
    };
  });
  const filled = grid.flatMap((row) => row.cells).filter((cell) => cell.occupancyPercent !== null);
  const sorted = [...filled].sort((a, b) => (b.occupancyPercent ?? 0) - (a.occupancyPercent ?? 0));
  return {
    times,
    rows: grid,
    best: sorted.length >= 2 ? (sorted[0] ?? null) : null,
    worst: sorted.length >= 2 ? (sorted[sorted.length - 1] ?? null) : null,
  };
}

/** «los sábados a las 16:30». */
export function slotText(cell: Pick<HeatCell, "weekday" | "time">): string {
  const day = (WEEKDAY_LABELS[cell.weekday - 1] ?? "").toLowerCase();
  return `los ${day.endsWith("s") ? day : `${day}s`} a las ${cell.time}`;
}
