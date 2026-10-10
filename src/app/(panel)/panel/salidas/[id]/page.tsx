import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Clock, Languages, MapPin, Plus, SearchX, StickyNote } from "lucide-react";
import { z } from "zod";

import { Box } from "@/components/ajustes/box";
import { EquipmentBox } from "@/components/manifiesto/equipment-box";
import { CheckAllButton, CheckInToggle, CollectButton, CopyManifestButton } from "@/components/manifiesto/passenger-actions";
import { SessionControls } from "@/components/manifiesto/session-controls";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { requireAccess } from "@/lib/auth";
import { longDayLabel } from "@/lib/domain/calendar";
import { canCollect, isLive, manifestSummary, manifestText, paxOf, sortManifest, ticketsLabel } from "@/lib/domain/manifest";
import { formatCents } from "@/lib/domain/money";
import { businessToday } from "@/lib/domain/schedule";
import { isLanguageCode, LANGUAGES } from "@/lib/domain/settings";
import { canBookSession } from "@/lib/domain/today";
import { cn } from "@/lib/utils";

import { loadManifest, type ManifestRow, type ManifestSession } from "./data";

export const metadata: Metadata = { title: "Manifiesto" };

export default async function Page({ params }: PageProps<"/panel/salidas/[id]">) {
  await requireAccess("hoy");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const now = new Date();
  const manifest = await loadManifest(id, now);
  if (!manifest) notFound();

  const { session, bookings, equipment } = manifest;
  const rows = sortManifest(bookings);
  const live = rows.filter(isLive);
  const summary = manifestSummary(rows);
  const free = Math.max(session.capacity - session.booked, 0);
  const language = isLanguageCode(session.language) ? LANGUAGES[session.language] : session.language.toUpperCase();
  const dayLabel = longDayLabel(session.date);
  const backHref = session.date === businessToday(now) ? "/panel" : `/panel?fecha=${session.date}`;
  const copyText = manifestText(
    { productName: session.product.name, dateLabel: dayLabel, time: session.time, language: session.language },
    rows,
  );

  return (
    <section className="flex flex-col gap-4 tablet:gap-5">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-1 px-1">
          <Link href={backHref}>
            <ArrowLeft aria-hidden="true" />
            Volver
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[0.72rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
            <span aria-hidden="true" className="size-2.5 rounded-[3px]" style={{ background: session.product.color }} />
            Manifiesto de pasajeros
          </p>
          <h1 className="mt-1 text-[1.25rem] tablet:text-[1.45rem]">{session.product.name}</h1>
          <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[0.84rem] text-muted-foreground [&_svg]:size-4">
            <li className="flex items-center gap-1.5 first-letter:uppercase">
              <CalendarDays aria-hidden="true" />
              <span className="first-letter:uppercase">{dayLabel}</span>
            </li>
            <li className="flex items-center gap-1.5">
              <Clock aria-hidden="true" />
              <span className="tabular-nums">
                {session.time}–{session.endTime}
              </span>
            </li>
            <li className="flex items-center gap-1.5">
              <Languages aria-hidden="true" />
              {language}
            </li>
            {session.product.meetingPoint ? (
              <li className="flex items-center gap-1.5">
                <MapPin aria-hidden="true" />
                {session.product.meetingPoint}
              </li>
            ) : null}
          </ul>
        </div>
        <div className="flex gap-2">
          <CopyManifestButton text={copyText} />
          {canBookSession(session) ? (
            <Button asChild>
              <Link href={`/panel/reservas/nueva?salida=${session.id}`}>
                <Plus aria-hidden="true" />
                Añadir reserva
              </Link>
            </Button>
          ) : (
            <Button disabled>
              <Plus aria-hidden="true" />
              Añadir reserva
            </Button>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-2 overflow-hidden rounded-2xl border border-black/5 bg-surface shadow-card tablet:grid-cols-4">
        <Kpi index={0} label="Ocupación" detail={`${free > 0 ? `${free} plazas libres` : "Completa"} · mín. ${session.product.minPax}`}>
          {session.booked}
          <span className="text-[1rem] text-faint"> / {session.capacity}</span>
        </Kpi>
        <Kpi
          index={1}
          label="Presentados"
          detail={
            <span
              role="progressbar"
              aria-label="Presentados"
              aria-valuemin={0}
              aria-valuemax={summary.pax}
              aria-valuenow={summary.checkedIn}
              className="mt-2 block h-[5px] overflow-hidden rounded-full bg-line-2"
            >
              <span
                className="block h-full rounded-full bg-ok"
                style={{ width: `${summary.pax ? (summary.checkedIn / summary.pax) * 100 : 0}%` }}
              />
            </span>
          }
        >
          {summary.checkedIn}
          <span className="text-[1rem] text-faint"> / {summary.pax}</span>
        </Kpi>
        <Kpi index={2} label="Entradas" small>
          {ticketsLabel(summary.tickets) || "—"}
        </Kpi>
        <Kpi
          index={3}
          label="Pendiente de cobro"
          detail={`${summary.invoiceCount} a facturar a agencias`}
          className={summary.dueCents ? "text-warn" : undefined}
        >
          {formatCents(summary.dueCents)}
        </Kpi>
      </dl>

      <div className="grid grid-cols-1 items-start gap-[18px] desk:grid-cols-[minmax(0,1fr)_340px]">
        <Box title="Pasajeros" action={<CheckAllButton sessionId={session.id} disabled={!live.some((row) => !row.checkedIn)} />}>
          {rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[0.86rem]">
                <thead>
                  <tr className="border-b border-line-2 text-left text-[0.72rem] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
                    <th scope="col" className="w-[60px] px-3 py-2.5 tablet:px-4">
                      Llegó
                    </th>
                    <th scope="col" className="px-2 py-2.5">
                      Cliente
                    </th>
                    <th scope="col" className="px-2 py-2.5">
                      Entradas
                    </th>
                    <th scope="col" className="px-2 py-2.5 max-desk:hidden">
                      {session.product.pickup ? "Recogida" : "Contacto"}
                    </th>
                    <th scope="col" className="px-3 py-2.5 tablet:px-4">
                      Pago
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <PassengerRow key={row.id} row={row} session={session} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 px-5 py-9 text-center text-muted-foreground">
              <SearchX aria-hidden="true" className="size-8 text-faint" />
              <b className="text-foreground">Sin reservas todavía</b>
              <span className="text-[0.86rem]">Añade una por teléfono o espera a que entren por la web.</span>
            </div>
          )}
        </Box>

        <div className="flex flex-col gap-[18px]">
          <Box title="Salida" action={<StatusPill status={session.status} />}>
            <div className="p-4">
              <SessionControls
                sessionId={session.id}
                status={session.status}
                capacity={session.capacity}
                booked={session.booked}
              />
            </div>
          </Box>
          <EquipmentBox
            sessionId={session.id}
            cancelled={session.status === "cancelled"}
            language={session.language}
            capacity={session.capacity}
            {...equipment}
          />
        </div>
      </div>
    </section>
  );
}

function Kpi({
  index,
  label,
  detail,
  small = false,
  className,
  children,
}: {
  index: number;
  label: string;
  detail?: React.ReactNode;
  small?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "min-w-0 px-3.5 py-3 tablet:px-[18px] tablet:py-3.5",
        index % 2 === 1 && "border-l border-line-2",
        index >= 2 && "border-t border-line-2 tablet:border-t-0",
        index === 2 && "tablet:border-l",
      )}
    >
      <dt className="text-[0.72rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">{label}</dt>
      <dd
        className={cn(
          "tabular-nums",
          small
            ? "mt-2 text-[0.95rem] font-medium"
            : "mt-[3px] text-[1.25rem] font-semibold tracking-[-0.03em] tablet:text-[1.6rem]",
          className,
        )}
      >
        {children}
      </dd>
      {detail ? <dd className="text-[0.76rem] text-muted-foreground">{detail}</dd> : null}
    </div>
  );
}

function StatusPill({ status }: { status: ManifestSession["status"] }) {
  if (status === "open") return <Pill tone="ok">A la venta</Pill>;
  if (status === "closed") return <Pill>Cerrada</Pill>;
  return <Pill className="bg-danger-soft text-danger">Cancelada</Pill>;
}

function PaymentCell({ row }: { row: ManifestRow }) {
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

function PassengerRow({ row, session }: { row: ManifestRow; session: ManifestSession }) {
  const live = isLive(row);
  const contact = row.phone || row.email;
  return (
    <tr
      aria-label={row.customerName}
      className={cn("border-b border-line-2 last:border-b-0", !live && "opacity-50", live && row.checkedIn && "bg-ok-soft/40")}
    >
      <td className="px-3 py-2.5 tablet:px-4">
        {live ? <CheckInToggle bookingId={row.id} checked={row.checkedIn} name={row.customerName} /> : null}
      </td>
      <td className="max-w-[220px] px-2 py-2.5">
        <Link href={`/panel/reservas/${row.code}`} className="block truncate font-semibold underline-offset-2 hover:underline">
          {row.customerName}
        </Link>
        <span className="font-mono text-[0.74rem] text-faint">{row.code}</span>
        {row.notes ? (
          <span title={row.notes} className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-warn-soft px-1.5 text-[0.7rem] font-semibold text-warn">
            <StickyNote aria-hidden="true" className="size-3" />
            Nota
          </span>
        ) : null}
        {/* En móvil y tablet no cabe la columna de recogida: va debajo del nombre, con la nota. */}
        <span className="mt-0.5 block text-[0.78rem] text-muted-foreground desk:hidden">
          {session.product.pickup ? (
            row.hotel || "En punto de encuentro"
          ) : row.phone ? (
            <a href={`tel:${row.phone}`} className="font-mono underline-offset-2 hover:underline">
              {row.phone}
            </a>
          ) : (
            row.email
          )}
        </span>
        {row.notes ? <span className="mt-0.5 block text-[0.78rem] text-warn desk:hidden">{row.notes}</span> : null}
        {row.notes ? <span className="sr-only max-desk:hidden">: {row.notes}</span> : null}
      </td>
      <td className="px-2 py-2.5">
        <b className="tabular-nums">{paxOf(row)}</b>{" "}
        <span className="text-[0.8rem] text-muted-foreground max-tablet:hidden">{ticketsLabel(row.lines)}</span>
      </td>
      <td className="px-2 py-2.5 text-[0.8rem] max-desk:hidden">
        {session.product.pickup ? (
          row.hotel || <span className="text-faint">En punto de encuentro</span>
        ) : contact ? (
          <span className="font-mono">{contact}</span>
        ) : (
          <span className="text-faint">—</span>
        )}
      </td>
      <td className="px-3 py-2.5 tablet:px-4">
        <PaymentCell row={row} />
      </td>
    </tr>
  );
}
