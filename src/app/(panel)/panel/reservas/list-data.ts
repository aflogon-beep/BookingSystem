import "server-only";

import { createClient } from "@/lib/db/server";
import { bookingListQuery, type BookingListParams, type ListFilter } from "@/lib/domain/booking-list";
import { rangeForDays, toBusinessDateTime } from "@/lib/domain/calendar";
import { ticketsLabel, type ManifestLine } from "@/lib/domain/manifest";
import { businessToday } from "@/lib/domain/schedule";

export type BookingListRow = {
  id: string;
  code: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
  channel: string;
  agent: string;
  totalCents: number;
  paidCents: number;
  checkedIn: boolean;
  startsAt: string;
  date: string;
  time: string;
  language: string;
  productName: string;
  productColor: string;
  customerName: string;
  email: string;
  phone: string;
  pax: number;
  tickets: string;
};

const COLUMNS =
  "id, code, status, payment_status, payment_method, channel, agent, total_cents, paid_cents, checked_in, starts_at, language, product_name, product_color, customer_name, customer_email, customer_phone, pax, lines";

// Supabase devuelve como mucho 1000 filas por petición: totales y CSV se leen por tandas.
const BATCH = 1000;
const MAX_ROWS = 20_000;

// Sin async: el constructor de consultas es «thenable» y un await lo ejecutaría.
function filteredQuery(
  supabase: Awaited<ReturnType<typeof createClient>>,
  columns: string,
  params: BookingListParams,
  now: Date,
  count?: "exact",
) {
  const { filters, ascending } = bookingListQuery(params, now, rangeForDays([businessToday(now)]));
  let query = supabase.from("booking_list").select(columns, count ? { count } : undefined);
  for (const filter of filters satisfies ListFilter[]) query = query.filter(filter.column, filter.operator, filter.value);
  return query.order("starts_at", { ascending }).order("code");
}

type ViewRow = {
  id: string | null;
  code: string | null;
  status: string | null;
  payment_status: string | null;
  payment_method: string | null;
  channel: string | null;
  agent: string | null;
  total_cents: number | null;
  paid_cents: number | null;
  checked_in: boolean | null;
  starts_at: string | null;
  language: string | null;
  product_name: string | null;
  product_color: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  pax: number | null;
  lines: unknown;
};

function isLine(value: unknown): value is ManifestLine {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ManifestLine).ticketName === "string" &&
    typeof (value as ManifestLine).qty === "number"
  );
}

function toRow(row: ViewRow): BookingListRow {
  const startsAt = row.starts_at ?? "";
  const { date, time } = toBusinessDateTime(startsAt);
  return {
    id: row.id ?? "",
    code: row.code ?? "",
    status: row.status ?? "",
    paymentStatus: row.payment_status ?? "",
    paymentMethod: row.payment_method,
    channel: row.channel ?? "",
    agent: row.agent ?? "",
    totalCents: row.total_cents ?? 0,
    paidCents: row.paid_cents ?? 0,
    checkedIn: row.checked_in ?? false,
    startsAt,
    date,
    time,
    language: row.language ?? "",
    productName: row.product_name ?? "",
    productColor: row.product_color ?? "#999999",
    customerName: row.customer_name ?? "",
    email: row.customer_email ?? "",
    phone: row.customer_phone ?? "",
    pax: row.pax ?? 0,
    tickets: ticketsLabel(Array.isArray(row.lines) ? row.lines.filter(isLine) : []),
  };
}

/** Una página del listado y el número total de reservas con esos filtros. */
export async function loadBookingPage(params: BookingListParams, now: Date): Promise<{ rows: BookingListRow[]; count: number }> {
  const { data, error, count } = await filteredQuery(await createClient(), COLUMNS, params, now, "exact").range(0, params.limit - 1);
  if (error) throw new Error("No se pudieron cargar las reservas.");
  return { rows: (data as unknown as ViewRow[]).map(toRow), count: count ?? data.length };
}

/** Totales de la cabecera con esos filtros: solo estado, pasajeros e importe de cada reserva. */
export async function loadBookingTotals(
  params: BookingListParams,
  now: Date,
): Promise<{ status: string; pax: number; totalCents: number }[]> {
  const rows: { status: string; pax: number; totalCents: number }[] = [];
  const supabase = await createClient();
  for (let from = 0; from < MAX_ROWS; from += BATCH) {
    const { data, error } = await filteredQuery(supabase, "status, pax, total_cents", params, now).range(from, from + BATCH - 1);
    if (error) throw new Error("No se pudieron cargar las reservas.");
    const batch = data as unknown as Pick<ViewRow, "status" | "pax" | "total_cents">[];
    rows.push(...batch.map((row) => ({ status: row.status ?? "", pax: row.pax ?? 0, totalCents: row.total_cents ?? 0 })));
    if (batch.length < BATCH) break;
  }
  return rows;
}

/** Todas las reservas con esos filtros (para totales y CSV), por tandas. */
export async function loadAllBookings(params: BookingListParams, now: Date): Promise<BookingListRow[]> {
  const rows: BookingListRow[] = [];
  const supabase = await createClient();
  for (let from = 0; from < MAX_ROWS; from += BATCH) {
    const { data, error } = await filteredQuery(supabase, COLUMNS, params, now).range(from, from + BATCH - 1);
    if (error) throw new Error("No se pudieron cargar las reservas.");
    rows.push(...(data as unknown as ViewRow[]).map(toRow));
    if (data.length < BATCH) break;
  }
  return rows;
}
