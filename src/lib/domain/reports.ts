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
  const channelTotal = summary.channels.reduce((sum, row) => sum + row.revenue_cents, 0);

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
