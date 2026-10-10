import type { Metadata } from "next";
import Link from "next/link";
import { Download, Globe, Handshake, Phone, Plus, SearchX, Store, type LucideIcon } from "lucide-react";

import { BookingStatusPill, PaymentPill } from "@/components/reservas/booking-pills";
import { BookingFilters } from "@/components/reservas/booking-filters";
import { Button } from "@/components/ui/button";
import { requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/db/server";
import { initials } from "@/lib/domain/resources";
import { CHANNEL_LABELS } from "@/lib/domain/booking-detail";
import { BOOKING_TABS, MAX_LIMIT, PAGE_SIZE, bookingListHref, bookingListSummary, listDateLabel, parseBookingListParams } from "@/lib/domain/booking-list";
import { formatCents } from "@/lib/domain/money";
import { cn } from "@/lib/utils";

import { loadBookingPage, loadBookingTotals, type BookingListRow } from "./list-data";

export const metadata: Metadata = { title: "Reservas" };

const CHANNEL_ICONS: Record<string, LucideIcon> = { web: Globe, phone: Phone, desk: Store, agency: Handshake };

export default async function Page({ searchParams }: PageProps<"/panel/reservas">) {
  await requireAccess("reservas");
  const params = parseBookingListParams(await searchParams);
  const now = new Date();
  const supabase = await createClient();
  const [{ rows, count }, totals, { data: products, error }] = await Promise.all([
    loadBookingPage(params, now),
    loadBookingTotals(params, now),
    supabase.from("products").select("id, name").order("name"),
  ]);
  if (error) throw new Error("No se pudieron cargar los productos.");
  const summary = bookingListSummary(totals);

  return (
    <section className="flex flex-col gap-4 tablet:gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[1.25rem] tablet:text-[1.45rem]">Reservas</h1>
          <p className="mt-[3px] text-[0.86rem] text-muted-foreground">
            {count === 1 ? "1 reserva" : `${count} reservas`} · {summary.pax === 1 ? "1 pasajero" : `${summary.pax} pasajeros`} · {formatCents(summary.totalCents)}
          </p>
        </div>
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
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[0.86rem]">
                <thead>
                  <tr className="border-b border-line-2 text-left text-[0.72rem] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
                    <th scope="col" className="px-3 py-2.5 tablet:px-4">
                      Reserva
                    </th>
                    <th scope="col" className="px-2 py-2.5">
                      Salida
                    </th>
                    <th scope="col" className="px-2 py-2.5 max-tablet:hidden">
                      Producto
                    </th>
                    <th scope="col" className="px-2 py-2.5 text-right">
                      Pax
                    </th>
                    <th scope="col" className="px-2 py-2.5 text-right max-tablet:hidden">
                      Total
                    </th>
                    <th scope="col" className="px-2 py-2.5">
                      Pago
                    </th>
                    <th scope="col" className="px-2 py-2.5 max-desk:hidden">
                      Canal
                    </th>
                    <th scope="col" className="px-3 py-2.5 tablet:px-4">
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <BookingRow key={row.id} row={row} />
                  ))}
                </tbody>
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
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 px-5 py-9 text-center text-muted-foreground">
            <SearchX aria-hidden="true" className="size-8 text-faint" />
            <b className="text-foreground">Ninguna reserva con estos filtros</b>
          </div>
        )}
      </div>
    </section>
  );
}

function BookingRow({ row }: { row: BookingListRow }) {
  const Icon = CHANNEL_ICONS[row.channel] ?? Globe;
  return (
    <tr aria-label={row.customerName} className="border-b border-line-2 last:border-b-0 hover:bg-surface-2">
      <td className="px-3 py-2.5 tablet:px-4">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="grid size-8 flex-none place-items-center rounded-full bg-primary-soft text-[0.72rem] font-semibold text-primary-dark max-tablet:hidden"
          >
            {initials(row.customerName)}
          </span>
          <div className="min-w-0">
            <Link
              href={`/panel/reservas/${row.code}`}
              className="block max-w-[190px] truncate font-semibold underline-offset-2 hover:underline"
            >
              {row.customerName}
            </Link>
            <span className="font-mono text-[0.74rem] text-faint">{row.code}</span>
            {/* En móvil el producto va debajo del nombre. */}
            <span className="block max-w-[190px] truncate text-[0.76rem] text-muted-foreground tablet:hidden">{row.productName}</span>
          </div>
        </div>
      </td>
      <td className="px-2 py-2.5 whitespace-nowrap">
        <span className="first-letter:uppercase">{listDateLabel(row.date)}</span>{" "}
        <span className="font-mono text-muted-foreground">{row.time}</span>
      </td>
      <td className="px-2 py-2.5 max-tablet:hidden">
        <span className="flex items-center gap-2 whitespace-nowrap">
          <span aria-hidden="true" className="size-2.5 flex-none rounded-[3px]" style={{ background: row.productColor }} />
          <span className="max-w-[200px] truncate">{row.productName}</span>
          <span className="font-mono text-[0.7rem] text-faint">{row.language.toUpperCase()}</span>
        </span>
      </td>
      <td className="px-2 py-2.5 text-right tabular-nums">{row.pax}</td>
      <td className="px-2 py-2.5 text-right tabular-nums max-tablet:hidden">{formatCents(row.totalCents)}</td>
      <td className="px-2 py-2.5">
        <PaymentPill paymentStatus={row.paymentStatus} />
      </td>
      <td className="px-2 py-2.5 whitespace-nowrap text-muted-foreground max-desk:hidden">
        <span className="inline-flex items-center gap-1.5">
          <Icon aria-hidden="true" className="size-3.5" />
          {CHANNEL_LABELS[row.channel] ?? row.channel}
          {row.agent ? ` · ${row.agent}` : ""}
        </span>
      </td>
      <td className="px-3 py-2.5 tablet:px-4">
        <BookingStatusPill status={row.status} checkedIn={row.checkedIn} />
      </td>
    </tr>
  );
}
