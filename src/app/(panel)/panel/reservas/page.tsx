import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, Globe, Handshake, Phone, Plus, SearchX, Store, type LucideIcon } from "lucide-react";

import { BookingStatusPill, PaymentPill } from "@/components/reservas/booking-pills";
import { BookingFilters } from "@/components/reservas/booking-filters";
import { BookingPreviewLink, BookingPreviewProvider } from "@/components/reservas/booking-preview";
import { BookingPulse } from "@/components/reservas/booking-pulse";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/db/server";
import { initials } from "@/lib/domain/resources";
import { CHANNEL_LABELS } from "@/lib/domain/booking-detail";
import {
  BOOKING_TABS,
  GLOBAL_SEARCH_PARAM,
  MAX_LIMIT,
  PAGE_SIZE,
  bookingListHref,
  bookingListSummary,
  exactCodeMatch,
  parseBookingListParams,
} from "@/lib/domain/booking-list";
import { previewStamp } from "@/lib/domain/booking-preview";
import { dayGroupLabel, groupByDay, showsPulse, type DayGroup } from "@/lib/domain/booking-pulse";
import { formatCents } from "@/lib/domain/money";
import { businessToday } from "@/lib/domain/schedule";
import { cn } from "@/lib/utils";

import { loadBookingPage, loadBookingPulse, loadBookingTotals, type BookingListRow } from "./list-data";

export const metadata: Metadata = { title: "Reservas" };

const CHANNEL_ICONS: Record<string, LucideIcon> = { web: Globe, phone: Phone, desk: Store, agency: Handshake };

export default async function Page({ searchParams }: PageProps<"/panel/reservas">) {
  await requireAccess("reservas");
  const raw = await searchParams;
  const params = parseBookingListParams(raw);
  const now = new Date();
  const today = businessToday(now);
  const supabase = await createClient();
  const [{ rows, count }, totals, pulse, { data: products, error }] = await Promise.all([
    loadBookingPage(params, now),
    loadBookingTotals(params, now),
    showsPulse(params) ? loadBookingPulse(params, now, today) : null,
    supabase.from("products").select("id, name").order("name"),
  ]);
  if (error) throw new Error("No se pudieron cargar los productos.");
  // Desde el buscador de arriba, un código exacto lleva directo a la reserva.
  const code = raw[GLOBAL_SEARCH_PARAM] === "1" ? exactCodeMatch(params.q, rows) : null;
  if (code) redirect(`/panel/reservas/${code}`);
  const summary = bookingListSummary(totals);
  const groups = groupByDay(rows);

  return (
    <section className="flex flex-col gap-4 tablet:gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[1.25rem] tablet:text-[1.45rem]">Reservas</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <a href={bookingListHref({ ...params, limit: PAGE_SIZE }, "/panel/reservas/csv")} download>
              <Download aria-hidden="true" />
              Exportar CSV
            </a>
          </Button>
          <Button asChild>
            <Link href="/panel/reservas/nueva">
              <Plus aria-hidden="true" />
              Nueva reserva
            </Link>
          </Button>
        </div>
      </div>

      <BookingPulse params={params} summary={summary} pulse={pulse} today={today} />

      <div className="overflow-hidden rounded-2xl border border-black/5 bg-surface shadow-card">
        <nav aria-label="Estado de las reservas" className="flex gap-1 overflow-x-auto border-b border-line-2 px-2">
          {BOOKING_TABS.map((tab) => {
            const current = tab.value === params.tab;
            return (
              <Link
                key={tab.value}
                href={bookingListHref({ ...params, tab: tab.value, limit: PAGE_SIZE })}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "-mb-px border-b-2 px-3 py-3 text-[0.86rem] font-medium whitespace-nowrap",
                  current ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
        <BookingFilters params={params} products={products} />

        {rows.length ? (
          <BookingPreviewProvider items={rows.map((row) => ({ code: row.code, stamp: previewStamp(row) }))}>
            <div className="overflow-x-auto">
              <table className="w-full text-[0.86rem] max-tablet:block">
                <thead className="max-tablet:sr-only">
                  <tr className="border-b border-line-2 text-left text-[0.72rem] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
                    <th scope="col" className="px-3 py-2.5 tablet:px-4">
                      Reserva
                    </th>
                    <th scope="col" className="px-2 py-2.5">
                      Hora
                    </th>
                    <th scope="col" className="px-2 py-2.5 max-tablet:hidden">
                      Producto
                    </th>
                    <th scope="col" className="px-2 py-2.5 text-right max-tablet:hidden">
                      Pax
                    </th>
                    <th scope="col" className="px-2 py-2.5 text-right max-tablet:hidden">
                      Total
                    </th>
                    <th scope="col" className="px-2 py-2.5 max-desk:hidden">
                      Canal
                    </th>
                    <th scope="col" className="px-3 py-2.5 tablet:px-4">
                      Estado y pago
                    </th>
                  </tr>
                </thead>
                {groups.map((group, index) => (
                  <tbody
                    key={group.date}
                    aria-label={dayGroupLabel(group.date, today).title}
                    className="day-group-in max-tablet:block"
                    style={{ animationDelay: `${Math.min(index, 6) * 50}ms` }}
                  >
                    <DayHeader
                      group={group}
                      today={today}
                      // El último día puede seguir en «Mostrar más»: sus cifras son «al menos».
                      partial={index === groups.length - 1 && count > rows.length}
                    />
                    {group.rows.map((row) => (
                      <BookingRow key={row.id} row={row} />
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
            {count > rows.length && params.limit < MAX_LIMIT ? (
              <div className="border-t border-line-2 p-3 text-center">
                <Button asChild variant="outline" size="sm">
                  <Link href={bookingListHref({ ...params, limit: params.limit + PAGE_SIZE })} scroll={false}>
                    Mostrar más ({count - rows.length})
                  </Link>
                </Button>
              </div>
            ) : count > rows.length ? (
              <p className="border-t border-line-2 p-3 text-center text-[0.84rem] text-muted-foreground">
                Se muestran {rows.length} de {count}. Afina los filtros o exporta el CSV para verlas todas.
              </p>
            ) : null}
          </BookingPreviewProvider>
        ) : (
          <EmptyState
            icon={SearchX}
            title="Ninguna reserva con estos filtros"
            text="Prueba otra pestaña o quita la búsqueda, el producto o el canal."
            action={
              <Button asChild variant="outline">
                <Link href="/panel/reservas">Quitar filtros</Link>
              </Button>
            }
          />
        )}
      </div>
    </section>
  );
}

/** Cabecera de cada día del listado: «Hoy · lunes 12 oct» y sus reservas, pasajeros e importe. */
function DayHeader({ group, today, partial }: { group: DayGroup<BookingListRow>; today: string; partial: boolean }) {
  const label = dayGroupLabel(group.date, today);
  const plus = partial ? "+" : "";
  return (
    <tr className="border-b border-line-2 bg-surface-2/70 max-tablet:block">
      <th scope="colgroup" colSpan={7} className="px-3 py-2 text-left font-normal max-tablet:block tablet:px-4">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {group.date === today ? <span aria-hidden="true" className="size-2 rounded-full bg-primary shadow-[0_0_0_3px_var(--blue-soft)]" /> : null}
          <span className={cn("text-[0.84rem] font-semibold first-letter:uppercase", group.date === today && "text-primary-dark")}>{label.title}</span>
          {label.detail ? <span className="text-[0.8rem] text-muted-foreground">{label.detail}</span> : null}
          <span className="ml-auto text-[0.76rem] text-muted-foreground tabular-nums">
            {group.bookings}
            {plus} {group.bookings === 1 && !partial ? "reserva" : "reservas"} · {group.pax}
            {plus} pax · {formatCents(group.totalCents)}
            {plus}
          </span>
        </span>
      </th>
    </tr>
  );
}

function BookingRow({ row }: { row: BookingListRow }) {
  const Icon = CHANNEL_ICONS[row.channel] ?? Globe;
  return (
    <tr
      aria-label={row.customerName}
      className={cn(
        "relative border-b border-line-2 last:border-b-0 hover:bg-surface-2",
        // La fila abierta en la vista previa queda marcada.
        "has-[a[aria-current=true]]:bg-primary-soft/60 has-[a[aria-current=true]]:shadow-[inset_3px_0_0_var(--primary)]",
        // En móvil cada fila es una tarjeta: cliente y salida a la izquierda, estado y pago a la derecha.
        "max-tablet:grid max-tablet:grid-cols-[minmax(0,1fr)_auto] max-tablet:items-center max-tablet:py-1.5",
      )}
    >
      <td className="min-w-0 px-3 py-2.5 max-tablet:pb-0 tablet:px-4">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="grid size-8 flex-none place-items-center rounded-full bg-primary-soft text-[0.72rem] font-semibold text-primary-dark max-tablet:hidden"
          >
            {initials(row.customerName)}
          </span>
          <div className="min-w-0">
            <BookingPreviewLink
              code={row.code}
              // Toda la fila abre la vista previa (con Ctrl/Cmd, la ficha en otra pestaña).
              className="block max-w-[190px] truncate max-tablet:max-w-full font-semibold underline-offset-2 after:absolute after:inset-0 after:content-[''] hover:underline"
            >
              {row.customerName}
            </BookingPreviewLink>
            <span className="font-mono text-[0.74rem] text-faint">{row.code}</span>
            {/* En móvil el producto va debajo del nombre. */}
            <span className="block max-w-[190px] truncate max-tablet:max-w-full text-[0.76rem] text-muted-foreground tablet:hidden">{row.productName}</span>
          </div>
        </div>
      </td>
      <td className="px-2 py-2.5 whitespace-nowrap max-tablet:col-start-1 max-tablet:px-3 max-tablet:pt-0.5 max-tablet:text-[0.8rem]">
        {/* El día va en la cabecera del grupo: aquí basta la hora. */}
        <span className="font-mono font-medium">{row.time}</span>
        {/* En móvil no cabe la columna de pasajeros: va debajo de la fecha. */}
        <span className="block text-[0.76rem] text-muted-foreground tablet:hidden">
          {row.pax} {row.pax === 1 ? "pasajero" : "pasajeros"}
        </span>
      </td>
      <td className="px-2 py-2.5 max-tablet:hidden">
        <span className="flex items-center gap-2 whitespace-nowrap">
          <span aria-hidden="true" className="size-2.5 flex-none rounded-[3px]" style={{ background: row.productColor }} />
          <span className="max-w-[200px] truncate">{row.productName}</span>
          <span className="font-mono text-[0.7rem] text-faint">{row.language.toUpperCase()}</span>
        </span>
      </td>
      <td className="px-2 py-2.5 text-right tabular-nums max-tablet:hidden">{row.pax}</td>
      <td className="px-2 py-2.5 text-right tabular-nums max-tablet:hidden">{formatCents(row.totalCents)}</td>
      <td className="px-2 py-2.5 whitespace-nowrap text-muted-foreground max-desk:hidden">
        <span className="inline-flex items-center gap-1.5">
          <Icon aria-hidden="true" className="size-3.5" />
          {CHANNEL_LABELS[row.channel] ?? row.channel}
          {row.agent ? ` · ${row.agent}` : ""}
        </span>
      </td>
      <td className="px-3 py-2.5 max-tablet:col-start-2 max-tablet:row-span-2 max-tablet:row-start-1 tablet:px-4">
        <div className="flex flex-col items-end gap-1 tablet:items-start desk:flex-row desk:flex-wrap">
          <BookingStatusPill status={row.status} checkedIn={row.checkedIn} />
          <PaymentPill paymentStatus={row.paymentStatus} />
        </div>
      </td>
    </tr>
  );
}
