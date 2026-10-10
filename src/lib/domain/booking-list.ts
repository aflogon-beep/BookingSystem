import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { z } from "zod";

import { CHANNEL_LABELS } from "@/lib/domain/booking-detail";

/** Pestañas del listado de reservas, en el orden del prototipo. */
export const BOOKING_TABS = [
  { value: "proximas", label: "Próximas" },
  { value: "hoy", label: "Hoy" },
  { value: "pendientes", label: "Pago pendiente" },
  { value: "pasadas", label: "Pasadas" },
  { value: "canceladas", label: "Canceladas" },
  { value: "todas", label: "Todas" },
] as const;

export type BookingTab = (typeof BOOKING_TABS)[number]["value"];

export const BOOKING_CHANNELS = ["web", "phone", "desk", "agency"] as const;
export type BookingChannel = (typeof BOOKING_CHANNELS)[number];

/** Reservas por página y «Mostrar más». */
export const PAGE_SIZE = 60;
const MAX_LIMIT = 600;

export type BookingListParams = {
  tab: BookingTab;
  q: string;
  productId: string | null;
  channel: BookingChannel | null;
  limit: number;
};

type RawParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Filtros del listado desde la URL (?pestana=&q=&producto=&canal=&mostrar=); lo que no vale se ignora. */
export function parseBookingListParams(raw: RawParams): BookingListParams {
  const tab = BOOKING_TABS.find((option) => option.value === first(raw.pestana))?.value ?? "proximas";
  const q = (first(raw.q) ?? "").trim().slice(0, 100);
  const product = first(raw.producto);
  const channel = BOOKING_CHANNELS.find((option) => option === first(raw.canal)) ?? null;
  const limit = Number(first(raw.mostrar));
  return {
    tab,
    q,
    productId: product && z.uuid().safeParse(product).success ? product : null,
    channel,
    limit: Number.isInteger(limit) && limit > PAGE_SIZE ? Math.min(limit, MAX_LIMIT) : PAGE_SIZE,
  };
}

/** URL del listado con esos filtros (sin los que están por defecto). */
export function bookingListHref(params: BookingListParams, base = "/panel/reservas"): string {
  const search = new URLSearchParams();
  if (params.tab !== "proximas") search.set("pestana", params.tab);
  if (params.q) search.set("q", params.q);
  if (params.productId) search.set("producto", params.productId);
  if (params.channel) search.set("canal", params.channel);
  if (params.limit > PAGE_SIZE) search.set("mostrar", String(params.limit));
  const query = search.toString();
  return query ? `${base}?${query}` : base;
}

export type ListFilter = { column: string; operator: "eq" | "neq" | "gte" | "lt" | "ilike"; value: string };

/** Escapa un texto para buscarlo con ilike (los comodines del usuario se buscan tal cual). */
export function ilikePattern(text: string): string {
  return `%${text.toLocaleLowerCase("es").replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/**
 * Filtros y orden de la vista booking_list para unos parámetros. Próximas y pasadas no incluyen
 * canceladas; las pasadas y canceladas van de la más reciente a la más antigua.
 * today: inicio y fin del día de hoy en la hora del negocio.
 */
export function bookingListQuery(
  params: BookingListParams,
  now: Date,
  today: { from: string; to: string },
): { filters: ListFilter[]; ascending: boolean } {
  const filters: ListFilter[] = [];
  const nowIso = now.toISOString();
  switch (params.tab) {
    case "proximas":
      filters.push({ column: "starts_at", operator: "gte", value: nowIso }, { column: "status", operator: "neq", value: "cancelled" });
      break;
    case "hoy":
      filters.push({ column: "starts_at", operator: "gte", value: today.from }, { column: "starts_at", operator: "lt", value: today.to });
      break;
    case "pendientes":
      filters.push({ column: "status", operator: "neq", value: "cancelled" }, { column: "payment_status", operator: "eq", value: "pending" });
      break;
    case "pasadas":
      filters.push({ column: "starts_at", operator: "lt", value: nowIso }, { column: "status", operator: "neq", value: "cancelled" });
      break;
    case "canceladas":
      filters.push({ column: "status", operator: "eq", value: "cancelled" });
      break;
    case "todas":
      break;
  }
  if (params.productId) filters.push({ column: "product_id", operator: "eq", value: params.productId });
  if (params.channel) filters.push({ column: "channel", operator: "eq", value: params.channel });
  if (params.q) filters.push({ column: "search_text", operator: "ilike", value: ilikePattern(params.q) });
  return { filters, ascending: params.tab !== "pasadas" && params.tab !== "canceladas" };
}

/** Totales de la cabecera: reservas, y pasajeros e importe de las no canceladas. */
export function bookingListSummary(rows: readonly { status: string; pax: number; totalCents: number }[]): {
  bookings: number;
  pax: number;
  totalCents: number;
} {
  const live = rows.filter((row) => row.status !== "cancelled");
  return {
    bookings: rows.length,
    pax: live.reduce((sum, row) => sum + row.pax, 0),
    totalCents: live.reduce((sum, row) => sum + row.totalCents, 0),
  };
}

export type CsvBooking = {
  code: string;
  date: string;
  time: string;
  productName: string;
  language: string;
  customerName: string;
  email: string;
  phone: string;
  tickets: string;
  pax: number;
  totalCents: number;
  paymentStatus: string;
  channel: string;
  status: string;
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  paid: "Pagada",
  refunded: "Reembolsada",
  invoice: "Factura",
};

const STATUS_LABELS: Record<string, string> = { confirmed: "Confirmada", cancelled: "Cancelada" };

function csvCell(value: string | number): string {
  const text = String(value);
  // Una celda que empieza por =, +, - o @ Excel la ejecuta como fórmula: se antepone un apóstrofo.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** CSV para Excel en español: separado por «;», importes con coma decimal y BOM para los acentos. */
export function bookingsCsv(rows: readonly CsvBooking[]): string {
  const header = ["Código", "Fecha", "Hora", "Producto", "Idioma", "Cliente", "Email", "Teléfono", "Entradas", "Pax", "Importe", "Pago", "Canal", "Estado"];
  const lines = rows.map((row) =>
    [
      row.code,
      row.date,
      row.time,
      row.productName,
      row.language.toUpperCase(),
      row.customerName,
      row.email,
      row.phone,
      row.tickets,
      row.pax,
      (row.totalCents / 100).toFixed(2).replace(".", ","),
      PAYMENT_STATUS_LABELS[row.paymentStatus] ?? row.paymentStatus,
      CHANNEL_LABELS[row.channel] ?? row.channel,
      STATUS_LABELS[row.status] ?? row.status,
    ]
      .map(csvCell)
      .join(";"),
  );
  return `﻿${[header.map(csvCell).join(";"), ...lines].join("\r\n")}\r\n`;
}

/** Fecha de la salida en el listado: «lun 13 oct». */
export function listDateLabel(date: string): string {
  return format(parseISO(date), "EEE d MMM", { locale: es }).replaceAll(".", "");
}

/** Nombre del archivo CSV: «reservas-proximas-2026-10-10.csv». */
export function csvFileName(tab: BookingTab, today: string): string {
  return `reservas-${tab}-${today}.csv`;
}
