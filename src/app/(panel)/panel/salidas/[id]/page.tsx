import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, ChevronRight, Clock, Languages, MapPin, Plus, StickyNote, Ticket, TriangleAlert, UserCheck, Users, Wallet, type LucideIcon } from "lucide-react";
import { z } from "zod";

import { BackLink } from "@/components/back-link";
import { Box } from "@/components/ajustes/box";
import { PhoneLinks } from "@/components/contact-buttons";
import { EmptyState } from "@/components/empty-state";
import { EquipmentBox } from "@/components/manifiesto/equipment-box";
import { ManifestMenu } from "@/components/manifiesto/manifest-menu";
import { ArrivalControl, CheckAllButton, CollectButton } from "@/components/manifiesto/passenger-actions";
import { SessionControls } from "@/components/manifiesto/session-controls";
import { ProductArt } from "@/components/productos/product-art";
import { STATE_PILL_CLASS, STATE_TEXT_CLASS, stateHint } from "@/components/salidas/session-state-style";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { requireAccess } from "@/lib/auth";
import { missingText } from "@/lib/domain/assignment";
import { longDayLabel } from "@/lib/domain/calendar";
import { canCollect, isLive, manifestSummary, manifestText, paxOf, sortManifest, ticketsLabel } from "@/lib/domain/manifest";
import { formatCents } from "@/lib/domain/money";
import { businessToday } from "@/lib/domain/schedule";
import { blockedReason, blockedText, sessionState, type SessionStateKind } from "@/lib/domain/session-state";
import { RESOURCE_TYPE_TEXT } from "@/lib/domain/resources";
import { isLanguageCode, LANGUAGES } from "@/lib/domain/settings";
import { cn } from "@/lib/utils";

import { loadManifest, type ManifestEquipment, type ManifestRow, type ManifestSession } from "./data";

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
  const waiting = summary.pax - summary.checkedIn - summary.noShows;
  const state = sessionState(session);
  const language = isLanguageCode(session.language) ? LANGUAGES[session.language] : session.language.toUpperCase();
  const dayLabel = longDayLabel(session.date);
  const backHref = session.date === businessToday(now) ? "/panel" : `/panel?fecha=${session.date}`;
  const alert = sessionAlert(session, equipment, state.kind, language);
  const copyText = manifestText(
    { productName: session.product.name, dateLabel: dayLabel, time: session.time, language: session.language },
    rows,
  );

  return (
    <section className="flex flex-col gap-4 tablet:gap-5">
      <div className="print:hidden">
        <BackLink fallbackHref={backHref} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-black/5 bg-surface shadow-card">
        {/* Al imprimir (para el guía) sobra la foto: solo el título. */}
        <h1 className="hidden px-4 pt-3 text-[1.3rem] print:block">{session.product.name}</h1>
        <div className="relative print:hidden">
          <ProductArt
            seed={session.product.id}
            color={session.product.color}
            photoUrl={session.product.photoUrl}
            className="h-[150px] tablet:h-[190px]"
          />
          <div aria-hidden="true" className="absolute inset-0 bg-linear-to-t from-black/70 via-black/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 px-4 pb-3.5 tablet:px-5">
            <p className="text-[0.72rem] font-semibold tracking-[0.06em] text-white/85 uppercase">Manifiesto de pasajeros</p>
            <h1 className="mt-0.5 text-[1.3rem] text-white [text-shadow:0_1px_8px_rgb(0_0_0/0.35)] tablet:text-[1.6rem]">
              {session.product.name}
            </h1>
          </div>
          <div className="absolute top-3 right-3">
            <ManifestMenu copyText={copyText} productId={session.product.id} dayHref={backHref} />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 tablet:px-5">
          <ul className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-[0.86rem] text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0">
            <li className="flex items-center gap-1.5">
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
              <li className="flex min-w-0 items-center gap-1.5">
                <MapPin aria-hidden="true" />
                {session.product.meetingPoint}
              </li>
            ) : null}
          </ul>
          {state.panelBookable ? (
            <Button asChild className="max-tablet:w-full print:hidden">
              <Link href={`/panel/reservas/nueva?salida=${session.id}`}>
                <Plus aria-hidden="true" />
                Añadir reserva
              </Link>
            </Button>
          ) : (
            <Button disabled title={stateHint(state)} className="max-tablet:w-full print:hidden">
              <Plus aria-hidden="true" />
              Añadir reserva
            </Button>
          )}
        </div>
      </div>

      {alert ? (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#f5d0a9] bg-warn-soft px-4 py-3.5 print:hidden">
          <span aria-hidden="true" className="grid size-9 flex-none place-items-center rounded-full bg-warn text-white">
            <TriangleAlert className="size-[18px]" />
          </span>
          <div className="min-w-0 flex-1 basis-[220px]">
            <b className="block font-semibold text-warn">{alert.title}</b>
            <span className="text-[0.86rem] text-[#5c3a14]">{alert.text}</span>
          </div>
          {alert.action ? (
            <Button asChild variant="outline" className="max-tablet:w-full">
              <a href="#equipo">
                {alert.action}
                <ChevronRight aria-hidden="true" />
              </a>
            </Button>
          ) : null}
        </div>
      ) : null}

      <dl className="grid grid-cols-2 overflow-hidden rounded-2xl border border-black/5 bg-surface shadow-card tablet:grid-cols-4">
        <Kpi
          index={0}
          icon={Users}
          label="Ocupación"
          detail={
            <>
              <Meter label="Ocupación" value={session.booked} max={session.capacity} className="bg-primary" />
              <span className={STATE_TEXT_CLASS[state.tone]}>{state.label}</span> · mín. {session.product.minPax}
            </>
          }
        >
          {session.booked}
          <span className="text-[1rem] text-faint"> / {session.capacity}</span>
        </Kpi>
        <Kpi
          index={1}
          icon={UserCheck}
          label="Presentados"
          detail={
            <>
              <Meter label="Presentados" value={summary.checkedIn} max={summary.pax} className="bg-ok" />
              {waiting > 0 ? `${waiting} por llegar` : summary.pax ? (summary.noShows ? "Nadie más por llegar" : "Han llegado todos") : "Sin pasajeros"}
              {summary.noShows ? ` · ${summary.noShows} no ${summary.noShows === 1 ? "vino" : "vinieron"}` : null}
            </>
          }
        >
          {summary.checkedIn}
          <span className="text-[1rem] text-faint"> / {summary.pax}</span>
        </Kpi>
        <Kpi index={2} icon={Ticket} label="Entradas" small>
          {ticketsLabel(summary.tickets) || "—"}
        </Kpi>
        <Kpi
          index={3}
          icon={Wallet}
          label="Pendiente de cobro"
          detail={`${summary.invoiceCount} a facturar a agencias`}
          className={summary.dueCents ? "text-warn" : undefined}
        >
          {formatCents(summary.dueCents)}
        </Kpi>
      </dl>

      <div className="grid grid-cols-1 items-start gap-[18px] desk:grid-cols-[minmax(0,1fr)_340px] print:block">
        <Box title="Pasajeros" action={
            <span className="print:hidden">
              <CheckAllButton sessionId={session.id} disabled={!live.some((row) => !row.checkedIn)} />
            </span>
          }>
          {rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[0.86rem]">
                <thead>
                  <tr className="border-b border-line-2 text-left text-[0.72rem] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
                    <th scope="col" className="w-[92px] px-3 py-2.5 tablet:px-4">
                      Llegó
                    </th>
                    <th scope="col" className="px-2 py-2.5">
                      Cliente
                    </th>
                    <th scope="col" className="px-2 py-2.5">
                      Entradas
                    </th>
                    <th scope="col" className="px-2 py-2.5 max-desk:hidden print:table-cell!">
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
            <EmptyState
              icon={Users}
              title="Sin reservas todavía"
              text="Añade una por teléfono o espera a que entren por la web."
              action={
                state.panelBookable ? (
                  <Button asChild size="lg">
                    <Link href={`/panel/reservas/nueva?salida=${session.id}`}>
                      <Plus aria-hidden="true" />
                      Añadir la primera reserva
                    </Link>
                  </Button>
                ) : null
              }
            />
          )}
        </Box>

        <div className="flex flex-col gap-[18px] print:hidden">
          <Box
            title="Gestión de la salida"
            action={
              <Pill
                tone={state.kind === "blocked" ? "warn" : state.kind === "available" || state.kind === "few" ? "ok" : "neutral"}
                className={state.kind === "full" ? STATE_PILL_CLASS.blue : undefined}
              >
                {state.kind === "blocked" ? state.label : STATUS_TEXT[state.kind]}
              </Pill>
            }
          >
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
            needs={equipment.needs}
            assignedIds={equipment.assignedIds}
            resources={equipment.resources}
            busyIds={equipment.busyIds}
          />
        </div>
      </div>
    </section>
  );
}

/** Barra fina de progreso bajo una cifra. */
function Meter({ label, value, max, className }: { label: string; value: number; max: number; className: string }) {
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      className="mt-1.5 mb-1 block h-[5px] overflow-hidden rounded-full bg-line-2"
    >
      <span className={cn("block h-full rounded-full", className)} style={{ width: `${max ? Math.min(100, (value / max) * 100) : 0}%` }} />
    </span>
  );
}

function Kpi({
  index,
  icon: Icon,
  label,
  detail,
  small = false,
  className,
  children,
}: {
  index: number;
  icon: LucideIcon;
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
      <dt className="flex items-center gap-1.5 text-[0.72rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        {label}
      </dt>
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

/** Estado de la salida en la caja «Salida»: el de sessionState, sin contar plazas. */
const STATUS_TEXT: Record<SessionStateKind, string> = {
  cancelled: "Cancelada",
  departed: "Ya salió",
  in_progress: "En ruta",
  closed: "Cerrada",
  blocked: "Sin recurso libre",
  full: "Completa",
  few: "A la venta",
  panel_only: "Solo panel",
  available: "A la venta",
};

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
  return (
    <tr
      aria-label={row.customerName}
      className={cn("border-b border-line-2 last:border-b-0", !live && "opacity-50", live && row.checkedIn && "bg-ok-soft/40", live && row.noShow && "bg-danger-soft/40")}
    >
      <td className="px-3 py-2.5 tablet:px-4">
        {live ? (
          <ArrivalControl
            bookingId={row.id}
            name={row.customerName}
            pax={paxOf(row)}
            checkedIn={row.checkedIn}
            arrivedPax={row.arrivedPax ?? null}
            noShow={row.noShow ?? false}
          />
        ) : null}
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
        <span className="mt-0.5 block text-[0.78rem] text-muted-foreground desk:hidden print:hidden">
          {session.product.pickup ? (
            row.hotel || "En punto de encuentro"
          ) : row.phone ? (
            <PhoneLinks name={row.customerName} phone={row.phone} />
          ) : (
            row.email
          )}
        </span>
        {row.notes ? <span className="mt-0.5 block text-[0.78rem] text-warn desk:hidden">{row.notes}</span> : null}
        {row.notes ? <span className="sr-only max-desk:hidden">: {row.notes}</span> : null}
      </td>
      <td className="px-2 py-2.5">
        <b className="tabular-nums">{paxOf(row)}</b>{" "}
        <span className="text-[0.8rem] text-muted-foreground max-tablet:hidden print:inline!">{ticketsLabel(row.lines)}</span>
      </td>
      <td className="px-2 py-2.5 text-[0.8rem] max-desk:hidden print:table-cell!">
        {session.product.pickup ? (
          row.hotel || <span className="text-faint">En punto de encuentro</span>
        ) : row.phone ? (
          <PhoneLinks name={row.customerName} phone={row.phone} />
        ) : row.email ? (
          <a href={`mailto:${row.email}`} className="underline-offset-2 hover:underline">
            {row.email}
          </a>
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

/**
 * Aviso destacado de la salida: no admite reservas por falta de un recurso obligatorio, o le falta
 * equipo por asignar. Nada en salidas canceladas o que ya salieron.
 */
function sessionAlert(
  session: ManifestSession,
  equipment: ManifestEquipment,
  kind: SessionStateKind,
  language: string,
): { title: string; text: string; action: string | null } | null {
  if (kind === "cancelled" || kind === "departed" || kind === "in_progress") return null;
  if (kind === "blocked" && session.blockingNeed) {
    const need = session.blockingNeed;
    const busy = equipment.busy.flatMap((item) => {
      const resource = equipment.resources.find((candidate) => candidate.id === item.resourceId && candidate.type === need);
      return resource ? [{ ...item, name: resource.name }] : [];
    });
    return {
      title: blockedText(need),
      text: `${blockedReason(need, busy, language)} Es obligatorio, así que esta salida no admite reservas hasta que quede libre.`,
      action: `Ver ${RESOURCE_TYPE_TEXT[need].plural.toLowerCase()}`,
    };
  }
  // Las salidas sin reservas aún no tienen equipo: se asigna solo con la primera.
  if (session.booked === 0) return null;
  const assigned = equipment.resources.filter((resource) => equipment.assignedIds.includes(resource.id));
  const missing = missingText(equipment.needs, assigned);
  if (!missing) return null;
  return { title: "Falta equipo por asignar", text: `Esta salida necesita ${missing} más.`, action: "Asignar equipo" };
}
