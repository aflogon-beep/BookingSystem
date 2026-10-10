import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { MonthView } from "@/components/calendario/month-view";
import { ProductFilter } from "@/components/calendario/product-filter";
import type { CalendarSession } from "@/components/calendario/types";
import { WeekView } from "@/components/calendario/week-view";
import { Button } from "@/components/ui/button";
import { requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/db/server";
import {
  calendarHref,
  calendarTitle,
  parseCalendarParams,
  rangeForDays,
  shiftAnchor,
  toBusinessDateTime,
  visibleDays,
  type CalendarView,
} from "@/lib/domain/calendar";
import { businessToday } from "@/lib/domain/schedule";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Calendario" };

const STATUSES = new Set<CalendarSession["status"]>(["open", "closed", "cancelled"]);

export default async function Page({ searchParams }: PageProps<"/panel/calendario">) {
  await requireAccess("calendario");
  const today = businessToday();
  const { view, anchor, productId: requestedProductId } = parseCalendarParams(await searchParams, today);
  const days = visibleDays(view, anchor);
  const { from, to } = rangeForDays(days);

  const supabase = await createClient();
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, name")
    .order("created_at")
    .order("name");
  if (productsError) throw new Error("No se pudo cargar el calendario.");
  // Un producto que ya no existe en la URL cuenta como «Todos los productos».
  const productId = products.some((product) => product.id === requestedProductId) ? requestedProductId : null;

  const [rows, booked, unstaffed] = await Promise.all([
    loadSessionRows(supabase, from, to, productId),
    loadBookedSeats(supabase, from, to, productId),
    loadUnstaffed(supabase, from, to, productId),
  ]);
  const sessions = toCalendarSessions(rows, booked, unstaffed, new Date());

  return (
    <section className="flex flex-col gap-4 tablet:gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[1.25rem] tablet:text-[1.45rem]">Calendario</h1>
          <p className="mt-[3px] text-[0.86rem] text-muted-foreground">
            Disponibilidad generada por las reglas de horario. Pulsa un día para ver sus salidas.
          </p>
        </div>
        <div className="flex w-full items-center gap-2 tablet:w-auto">
          <div className="min-w-0 flex-1 tablet:flex-none">
            <ProductFilter products={products} view={view} anchor={anchor} productId={productId} />
          </div>
          <ViewSwitch view={view} anchor={anchor} productId={productId} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          <Button asChild variant="outline" size="icon-sm">
            <Link href={calendarHref({ view, anchor: shiftAnchor(view, anchor, -1), productId })} aria-label="Anterior">
              <ChevronLeft aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={calendarHref({ view, productId })}>Hoy</Link>
          </Button>
          <Button asChild variant="outline" size="icon-sm">
            <Link href={calendarHref({ view, anchor: shiftAnchor(view, anchor, 1), productId })} aria-label="Siguiente">
              <ChevronRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
        <h2 className="text-[1.15rem] first-letter:uppercase">{calendarTitle(view, anchor)}</h2>
      </div>

      {view === "mes" ? (
        <MonthView days={days} month={anchor.slice(0, 7)} sessions={sessions} today={today} productId={productId} />
      ) : (
        <WeekView days={days} sessions={sessions} today={today} />
      )}
    </section>
  );
}

// PostgREST corta cada respuesta en max_rows (1000): un mes con muchos productos lo supera.
const PAGE_SIZE = 1000;

async function loadSessionRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  from: string,
  to: string,
  productId: string | null,
): Promise<SessionRow[]> {
  const rows: SessionRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = supabase
      .from("sessions")
      .select("id, starts_at, language, capacity, status, products!inner(name, color, min_pax)")
      .gte("starts_at", from)
      .lt("starts_at", to)
      .order("starts_at")
      .order("id")
      .range(offset, offset + PAGE_SIZE - 1);
    if (productId) query = query.eq("product_id", productId);
    const { data, error } = await query;
    if (error) throw new Error("No se pudo cargar el calendario.");
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }
}

/** Plazas ocupadas por salida (vista session_availability: confirmadas y bloqueos vigentes). */
async function loadBookedSeats(
  supabase: Awaited<ReturnType<typeof createClient>>,
  from: string,
  to: string,
  productId: string | null,
): Promise<Map<string, number>> {
  const booked = new Map<string, number>();
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = supabase
      .from("session_availability")
      .select("session_id, booked_seats")
      .gte("starts_at", from)
      .lt("starts_at", to)
      .gt("booked_seats", 0)
      .order("starts_at")
      .order("session_id")
      .range(offset, offset + PAGE_SIZE - 1);
    if (productId) query = query.eq("product_id", productId);
    const { data, error } = await query;
    if (error) throw new Error("No se pudo cargar el calendario.");
    for (const row of data) if (row.session_id) booked.set(row.session_id, row.booked_seats ?? 0);
    if (data.length < PAGE_SIZE) return booked;
  }
}

/** Salidas a las que les falta equipo (vista session_staffing). */
async function loadUnstaffed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  from: string,
  to: string,
  productId: string | null,
): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = supabase
      .from("session_staffing")
      .select("session_id")
      .gte("starts_at", from)
      .lt("starts_at", to)
      .gt("missing", 0)
      .order("starts_at")
      .order("session_id")
      .range(offset, offset + PAGE_SIZE - 1);
    if (productId) query = query.eq("product_id", productId);
    const { data, error } = await query;
    if (error) throw new Error("No se pudo cargar el calendario.");
    for (const row of data) if (row.session_id) ids.add(row.session_id);
    if (data.length < PAGE_SIZE) return ids;
  }
}

type SessionRow = {
  id: string;
  starts_at: string;
  language: string;
  capacity: number;
  status: string;
  products: { name: string; color: string; min_pax: number };
};

function toCalendarSessions(
  rows: readonly SessionRow[],
  booked: ReadonlyMap<string, number>,
  unstaffed: ReadonlySet<string>,
  now: Date,
): CalendarSession[] {
  return rows.map((row) => {
    const { date, time } = toBusinessDateTime(row.starts_at);
    return {
      id: row.id,
      date,
      time,
      language: row.language,
      capacity: row.capacity,
      booked: booked.get(row.id) ?? 0,
      status: STATUSES.has(row.status as CalendarSession["status"]) ? (row.status as CalendarSession["status"]) : "open",
      unstaffed: unstaffed.has(row.id),
      past: new Date(row.starts_at) < now,
      product: { name: row.products.name, color: row.products.color, minPax: row.products.min_pax },
    };
  });
}

/** Control segmentado Mes / Semana («seg2» del prototipo). */
function ViewSwitch({ view, anchor, productId }: { view: CalendarView; anchor: string; productId: string | null }) {
  const options: { value: CalendarView; label: string }[] = [
    { value: "mes", label: "Mes" },
    { value: "semana", label: "Semana" },
  ];
  return (
    <nav aria-label="Vista" className="inline-flex flex-none gap-0.5 rounded-[9px] bg-[#e8e8ed] p-[3px]">
      {options.map((option) => {
        const current = option.value === view;
        return (
          <Link
            key={option.value}
            href={calendarHref({ view: option.value, anchor, productId })}
            aria-current={current ? "page" : undefined}
            className={cn(
              "rounded-md px-[11px] py-[5px] text-[0.8rem] font-medium max-tablet:py-2",
              current ? "bg-surface text-foreground shadow-[0_1px_2px_rgb(16_24_40/0.12)]" : "text-muted-foreground",
            )}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}
