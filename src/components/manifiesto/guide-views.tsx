import Link from "next/link";
import { Check, Flag, MapPin, Navigation, StickyNote } from "lucide-react";

import type { ManifestRow, ManifestSession } from "@/app/(panel)/panel/salidas/[id]/data";
import { PhoneLinks } from "@/components/contact-buttons";
import { ArrivalControl, CollectButton } from "@/components/manifiesto/passenger-actions";
import { Pill } from "@/components/ui/pill";
import { MANIFEST_VIEWS, pickupStops, stopDone, type ManifestView } from "@/lib/domain/guide-sheet";
import { arrivalState, canCollect, isLive, paxOf, ticketsLabel } from "@/lib/domain/manifest";
import { formatCents } from "@/lib/domain/money";
import { cn } from "@/lib/utils";

/** Pestañas del manifiesto: hoja del guía (tarjetas), ruta de recogidas y la lista de siempre. */
export function ManifestTabs({ sessionId, view }: { sessionId: string; view: ManifestView }) {
  return (
    <nav aria-label="Vista del manifiesto" className="border-b border-line-2 px-3 py-2.5 print:hidden tablet:px-4">
      <div className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-[9px] bg-[#e8e8ed] p-[3px]">
        {MANIFEST_VIEWS.map((option) => (
          <Link
            key={option.value}
            href={option.value === "guia" ? `/panel/salidas/${sessionId}` : `/panel/salidas/${sessionId}?vista=${option.value}`}
            replace
            scroll={false}
            aria-current={option.value === view ? "page" : undefined}
            className={cn(
              "inline-flex items-center rounded-md px-3 py-[5px] text-[0.8rem] font-medium whitespace-nowrap max-tablet:py-2",
              option.value === view ? "bg-surface text-foreground shadow-[0_1px_2px_rgb(16_24_40/0.12)]" : "text-muted-foreground",
            )}
          >
            {option.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function PaymentCell({ row }: { row: ManifestRow }) {
  if (!isLive(row)) return <Pill className="bg-danger-soft text-danger">Cancelada</Pill>;
  if (canCollect(row)) {
    return (
      <CollectButton
        bookingId={row.id}
        code={row.code}
        totalCents={row.totalCents}
        customerName={row.customerName}
        tickets={ticketsLabel(row.lines)}
      />
    );
  }
  if (row.paymentStatus === "paid") return <Pill tone="ok">Pagada</Pill>;
  if (row.paymentStatus === "invoice") return <Pill>Factura{row.agent ? ` · ${row.agent}` : ""}</Pill>;
  if (row.paymentStatus === "refunded") return <Pill>Reembolsada</Pill>;
  return <Pill tone="warn">Pendiente</Pill>;
}

const CARD_TONE = {
  pending: "border-line bg-surface",
  arrived: "border-ok/25 bg-ok-soft/60",
  partial: "border-[#ff9f0a]/30 bg-[#fff4e5]",
  no_show: "border-danger/20 bg-danger-soft/50",
} as const;

/** Hoja del guía: una tarjeta grande por grupo, con el check-in al alcance del pulgar. */
export function GuideCards({ rows, session }: { rows: ManifestRow[]; session: ManifestSession }) {
  const live = rows.filter(isLive);
  const cancelled = rows.filter((row) => !isLive(row));
  return (
    <div className="flex flex-col gap-3 p-3 tablet:p-4">
      <ul aria-label="Grupos" className="grid grid-cols-[minmax(0,1fr)] gap-2.5 tablet:grid-cols-2">
        {live.map((row) => (
          <li key={row.id} className="min-w-0">
            <GuideCard row={row} session={session} />
          </li>
        ))}
      </ul>
      {cancelled.length ? (
        <details className="rounded-xl border border-line-2 px-3 py-2 text-[0.84rem] text-muted-foreground">
          <summary className="cursor-pointer font-medium">
            {cancelled.length === 1 ? "1 reserva cancelada" : `${cancelled.length} reservas canceladas`}
          </summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {cancelled.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-2">
                <Link href={`/panel/reservas/${row.code}`} className="truncate underline-offset-2 hover:underline">
                  {row.customerName} · {paxOf(row)} pax
                </Link>
                <PaymentCell row={row} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function GuideCard({ row, session }: { row: ManifestRow; session: ManifestSession }) {
  const pax = paxOf(row);
  const state = arrivalState(row);
  return (
    <article aria-label={row.customerName} className={cn("flex h-full gap-3 rounded-xl border p-3 transition-colors", CARD_TONE[state])}>
      <div className="flex-none">
        <ArrivalControl
          size="lg"
          bookingId={row.id}
          name={row.customerName}
          pax={pax}
          checkedIn={row.checkedIn}
          arrivedPax={row.arrivedPax ?? null}
          noShow={row.noShow ?? false}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/panel/reservas/${row.code}`}
            className={cn(
              "min-w-0 truncate text-[1rem] font-semibold underline-offset-2 hover:underline",
              state === "no_show" && "line-through decoration-danger/60",
            )}
          >
            {row.customerName}
          </Link>
          <span className="flex-none text-[1.15rem] leading-none font-semibold tracking-[-0.02em] tabular-nums">
            {pax}
            <span className="text-[0.7rem] font-medium text-muted-foreground"> pax</span>
          </span>
        </div>
        <p className="text-[0.8rem] text-muted-foreground">
          {ticketsLabel(row.lines)} · <span className="font-mono text-faint">{row.code}</span>
        </p>
        {session.product.pickup ? (
          <p className="flex items-center gap-1.5 text-[0.82rem]">
            <MapPin aria-hidden="true" className="size-3.5 flex-none text-muted-foreground" />
            <span className="truncate">{row.hotel || session.product.meetingPoint || "Punto de encuentro"}</span>
          </p>
        ) : null}
        {row.phone ? <PhoneLinks name={row.customerName} phone={row.phone} className="text-[0.82rem]" /> : null}
        {row.notes ? (
          <p className="mt-0.5 flex gap-1.5 rounded-lg bg-warn-soft px-2 py-1.5 text-[0.8rem] text-[#5c3a14]">
            <StickyNote aria-hidden="true" className="mt-px size-3.5 flex-none text-warn" />
            <span>{row.notes}</span>
          </p>
        ) : null}
        <div className="mt-1">
          <PaymentCell row={row} />
        </div>
      </div>
    </article>
  );
}

/** Ruta de recogidas: una parada por hotel (y el punto de encuentro), con quién sube en cada una. */
export function PickupRoute({ rows, session }: { rows: ManifestRow[]; session: ManifestSession }) {
  const stops = pickupStops(rows, session.product.meetingPoint);
  const pax = stops.reduce((sum, stop) => sum + stop.pax, 0);
  return (
    <div className="p-4 tablet:px-5">
      <p className="mb-4 text-[0.84rem] text-muted-foreground">
        {session.product.pickup
          ? `${stops.length === 1 ? "1 parada" : `${stops.length} paradas`} · ${pax} pax. Las paradas sin hotel suben en el punto de encuentro.`
          : "Este tour no tiene recogida: todos los grupos van al punto de encuentro."}
      </p>
      <ol aria-label="Paradas" className="flex flex-col">
        {stops.map((stop, index) => {
          const done = stopDone(stop);
          const last = index === stops.length - 1;
          return (
            <li
              key={stop.key}
              aria-label={stop.name}
              className="route-stop flex gap-3"
              style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
            >
              <div className="flex flex-none flex-col items-center">
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-8 place-items-center rounded-full text-[0.85rem] font-semibold text-white shadow-sm",
                    done && "bg-ok",
                  )}
                  style={done ? undefined : { background: session.product.color }}
                >
                  {done ? <Check className="size-4" strokeWidth={3} /> : stop.meetingPoint ? <Flag className="size-4" /> : index + (stops[0]?.meetingPoint ? 0 : 1)}
                </span>
                {last ? null : <span aria-hidden="true" className={cn("my-1 w-0.5 flex-1 rounded-full", done ? "bg-ok/40" : "bg-line")} />}
              </div>
              <div className={cn("min-w-0 flex-1", last ? "pb-1" : "pb-5")}>
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                  <div className="min-w-0">
                    <h3 className="text-[0.98rem] leading-tight font-semibold">{stop.name}</h3>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${stop.name}, Tenerife`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-0.5 inline-flex items-center gap-1 text-[0.78rem] font-medium text-primary underline-offset-2 hover:underline"
                    >
                      <Navigation aria-hidden="true" className="size-3" />
                      Cómo llegar
                    </a>
                  </div>
                  <span className={cn("text-[0.82rem] font-semibold tabular-nums", done ? "text-ok" : "text-muted-foreground")}>
                    {stop.arrived}/{stop.pax} a bordo
                  </span>
                </div>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {stop.bookings.map((row) => (
                    <li key={row.id} className="flex items-center gap-2.5 rounded-lg bg-line-2/50 px-2 py-1.5">
                      <ArrivalControl
                        bookingId={row.id}
                        name={row.customerName}
                        pax={paxOf(row)}
                        checkedIn={row.checkedIn}
                        arrivedPax={row.arrivedPax ?? null}
                        noShow={row.noShow ?? false}
                      />
                      <div className="min-w-0 flex-1 text-[0.84rem]">
                        <p className="flex items-baseline gap-1.5">
                          <Link href={`/panel/reservas/${row.code}`} className="truncate font-semibold underline-offset-2 hover:underline">
                            {row.customerName}
                          </Link>
                          <span className="flex-none text-muted-foreground tabular-nums">{paxOf(row)} pax</span>
                        </p>
                        {row.phone ? (
                          <PhoneLinks name={row.customerName} phone={row.phone} className="text-[0.78rem] text-muted-foreground" />
                        ) : null}
                        {row.notes ? <p className="text-[0.78rem] text-warn">{row.notes}</p> : null}
                        {canCollect(row) ? (
                          <span className="mt-0.5 inline-block rounded-full bg-warn-soft px-2 py-0.5 text-[0.72rem] font-semibold text-warn tabular-nums">
                            Cobrar {formatCents(row.totalCents)}
                          </span>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
