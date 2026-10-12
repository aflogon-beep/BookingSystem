import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Clock3, History, MapPin, Ticket, UserRound, type LucideIcon } from "lucide-react";

import { BackLink } from "@/components/back-link";
import { ContactButtons } from "@/components/contact-buttons";
import { CollectButton } from "@/components/manifiesto/passenger-actions";
import {
  CancelBookingButton,
  CheckInButton,
  EditDetailsButton,
  EditLinesButton,
  MoveBookingForm,
  NotesField,
  ResendButton,
} from "@/components/reservas/booking-actions";
import { Pill } from "@/components/ui/pill";
import { requireAccess } from "@/lib/auth";
import { avatarColor, initials } from "@/lib/avatar";
import {
  balanceSummary,
  cancellationNote,
  CHANNEL_LABELS,
  isEditable,
  isFreeCancellation,
  moveOptionLabel,
  paymentLabel,
} from "@/lib/domain/booking-detail";
import { longDayLabel, toBusinessDateTime } from "@/lib/domain/calendar";
import { arrivalLabel, arrivalState } from "@/lib/domain/manifest";
import { formatCents } from "@/lib/domain/money";
import { BUSINESS_TIMEZONE } from "@/lib/domain/schedule";
import { cn } from "@/lib/utils";

import { loadBookingDetail, type BookingDetail } from "./data";

export const metadata: Metadata = { title: "Reserva" };

const CODE = /^VT[0-9A-Z]{6}$/;

const dateTime = new Intl.DateTimeFormat("es-ES", {
  timeZone: BUSINESS_TIMEZONE,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const SECTION_TITLE = "text-[0.72rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase";
const ACTION = "h-12 w-full tablet:h-10";

/**
 * Ficha de una reserva: cabecera con la salida y las cifras, acciones rápidas, entradas y pago,
 * cliente, notas, cambio de fecha, historial y cancelación. En móvil, una columna; en escritorio,
 * las acciones y el historial van a la derecha.
 */
export default async function Page({ params }: PageProps<"/panel/reservas/[codigo]">) {
  await requireAccess("reservas");
  const { codigo } = await params;
  if (!CODE.test(codigo)) notFound();
  const now = new Date();
  const booking = await loadBookingDetail(codigo, now);
  if (!booking) notFound();

  const { date, time } = toBusinessDateTime(booking.session.startsAt);
  const cancelled = booking.status === "cancelled" || booking.status === "expired";
  const editable = isEditable(booking.status, booking.session.startsAt, now);
  const tickets = booking.lines.map((line) => `${line.qty} ${line.name}`).join(" · ");
  const pax = booking.lines.reduce((sum, line) => sum + line.qty, 0);
  const balance = balanceSummary(booking);
  const canCollect = booking.paymentStatus === "pending" && booking.status === "confirmed";
  const hasActions = !cancelled && booking.status === "confirmed";

  return (
    <section className="mx-auto flex w-full max-w-[640px] flex-col gap-4 desk:max-w-[1040px]">
      <div>
        <BackLink fallbackHref={`/panel/salidas/${booking.session.id}`} />
      </div>

      {/* Cabecera: quién, estado, cifras y la salida. */}
      <div className="overflow-hidden rounded-2xl border border-black/5 bg-surface shadow-card">
        <div aria-hidden="true" className="h-1.5" style={{ background: booking.product.color }} />
        <div className="flex flex-col gap-4 p-4 tablet:p-5">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="grid size-12 flex-none place-items-center rounded-full text-[1rem] font-semibold text-white"
              style={{ background: avatarColor(booking.customer.name) }}
            >
              {initials(booking.customer.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className={SECTION_TITLE}>
                Reserva <span className="font-mono tracking-normal">{booking.code}</span>
              </p>
              <h1 className="mt-0.5 text-[1.3rem] leading-tight break-words tablet:text-[1.5rem]">{booking.customer.name}</h1>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <StatusPill booking={booking} />
                <PaymentPill booking={booking} />
              </div>
            </div>
          </div>

          <dl className="grid grid-cols-3 divide-x divide-line-2 rounded-xl bg-surface-2 py-3 text-center">
            <Stat label="Personas" value={String(pax)} />
            <Stat label="Total" value={formatCents(booking.totalCents)} />
            <Stat
              label={balance.label}
              value={balance.value}
              className={cn(balance.tone === "ok" && "text-ok", balance.tone === "warn" && "text-warn")}
            />
          </dl>

          <Link
            href={`/panel/salidas/${booking.session.id}`}
            className="-mx-1 flex items-center gap-3 rounded-xl px-1 py-1 hover:bg-surface-2"
          >
            <span aria-hidden="true" className="size-10 flex-none rounded-[10px]" style={{ background: booking.product.color }} />
            <span className="min-w-0 flex-1">
              <b className="block truncate font-semibold">{booking.product.name}</b>
              <span className="block text-[0.84rem] text-muted-foreground">
                <span className="inline-block first-letter:uppercase">{longDayLabel(date)}</span> ·{" "}
                <span className="tabular-nums">{time}</span> · {booking.session.language.toUpperCase()}
              </span>
            </span>
            <ChevronRight aria-hidden="true" className="size-5 flex-none text-faint" />
          </Link>
          {!booking.product.pickup && booking.product.meetingPoint ? (
            <p className="-mt-2 flex items-start gap-1.5 text-[0.8rem] text-muted-foreground">
              <MapPin aria-hidden="true" className="mt-0.5 size-3.5 flex-none" />
              <span className="min-w-0">Punto de encuentro: {booking.product.meetingPoint}</span>
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-4 desk:grid desk:grid-cols-[minmax(0,1fr)_340px] desk:items-start">
        {/* Columna principal. En móvil, `contents` deja que las tarjetas se ordenen con las de la derecha. */}
        <div className="contents desk:flex desk:flex-col desk:gap-4">
          <Card
            className="order-2"
            icon={Ticket}
            title="Entradas y pago"
            action={
              editable && booking.status === "confirmed" && ["pending", "invoice"].includes(booking.paymentStatus) && booking.ticketOptions.length ? (
                <EditLinesButton bookingId={booking.id} options={booking.ticketOptions} />
              ) : null
            }
          >
            <ul className="flex flex-col gap-2 text-[0.9rem]">
              {booking.lines.map((line, index) => (
                <li key={`${index}-${line.name}`} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0">
                    <b className="font-semibold tabular-nums">{line.qty}</b> × {line.name}
                    <small className="ml-1.5 text-[0.78rem] text-faint tabular-nums">{formatCents(line.unitCents)}</small>
                  </span>
                  <span className="tabular-nums">{formatCents(line.qty * line.unitCents)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 flex items-baseline justify-between border-t border-line-2 pt-3 font-semibold">
              <span>Total</span>
              <span className="text-[1.05rem] tabular-nums">{formatCents(booking.totalCents)}</span>
            </p>
            <Details
              className="mt-4"
              items={[
                ["Pago", paymentLabel(booking)],
                ["Canal", `${CHANNEL_LABELS[booking.channel] ?? booking.channel}${booking.agent ? ` · ${booking.agent}` : ""}`],
                ...(booking.product.pickup ? [["Recogida", booking.hotel || "Punto de encuentro"] as [string, React.ReactNode]] : []),
              ]}
            />
          </Card>

          <Card
            className="order-3"
            icon={UserRound}
            title="Cliente"
            action={
              !cancelled ? (
                <EditDetailsButton
                  bookingId={booking.id}
                  details={{ ...booking.customer, hotel: booking.hotel }}
                  showHotel={booking.product.pickup}
                />
              ) : null
            }
          >
            <Details
              items={[
                ["Email", booking.customer.email ? <span className="break-all">{booking.customer.email}</span> : <Missing>Sin email</Missing>],
                [
                  "Teléfono",
                  booking.customer.phone ? <span className="font-mono">{booking.customer.phone}</span> : <Missing>Sin teléfono</Missing>,
                ],
              ]}
            />
            {booking.customer.email || booking.customer.phone ? (
              <ContactButtons
                name={booking.customer.name}
                phone={booking.customer.phone}
                email={booking.customer.email}
                className="mt-3 [&>*]:flex-1 tablet:[&>*]:flex-none"
              />
            ) : (
              <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2.5 text-[0.8rem] text-muted-foreground">
                Sin datos de contacto. Pulsa <b className="font-semibold">Editar</b> para añadir un email o un teléfono y poder avisar al
                cliente.
              </p>
            )}
          </Card>

          <Card className="order-4">
            <NotesField bookingId={booking.id} notes={booking.notes} />
          </Card>

          {editable && booking.moveOptions.length ? (
            <Card className="order-5">
              <MoveBookingForm
                bookingId={booking.id}
                options={booking.moveOptions.map((option) => ({ id: option.id, label: moveOptionLabel(option) }))}
              />
            </Card>
          ) : null}
        </div>

        <div className="contents desk:flex desk:flex-col desk:gap-4">
          {hasActions ? (
            <div role="group" aria-label="Acciones" className="order-1 grid grid-cols-2 gap-2">
              {canCollect ? (
                <CollectButton
                  bookingId={booking.id}
                  code={booking.code}
                  totalCents={booking.totalCents}
                  customerName={booking.customer.name}
                  tickets={tickets}
                  className={cn(ACTION, "col-span-2 border-warn/30 bg-warn-soft font-semibold hover:bg-warn-soft")}
                />
              ) : null}
              <CheckInButton
                bookingId={booking.id}
                name={booking.customer.name}
                pax={pax}
                state={arrivalState(booking)}
                className={ACTION}
              />
              {booking.customer.email ? <ResendButton bookingId={booking.id} className={ACTION} /> : null}
            </div>
          ) : null}

          <Card className="order-6" icon={History} title="Historial">
            <ol className="flex flex-col">
              {booking.events.map((event, index) => (
                <li key={event.id} className="relative flex gap-3 pb-3.5 last:pb-0">
                  {index < booking.events.length - 1 ? (
                    <span aria-hidden="true" className="absolute top-3 bottom-0 left-[4.5px] w-px bg-line" />
                  ) : null}
                  <span
                    aria-hidden="true"
                    className={cn("mt-1.5 size-2.5 flex-none rounded-full", index === 0 ? "bg-primary" : "bg-line")}
                  />
                  <span className="min-w-0 text-[0.86rem] break-words">
                    {event.text}
                    <small className="mt-0.5 flex items-center gap-1 text-[0.75rem] text-faint">
                      <Clock3 aria-hidden="true" className="size-3" />
                      {dateTime.format(new Date(event.at))} · {event.actor}
                    </small>
                  </span>
                </li>
              ))}
            </ol>
          </Card>

          {editable ? (
            <div className="order-7 flex flex-col gap-2 rounded-2xl border border-dashed border-line p-4">
              <p className="text-[0.8rem] text-muted-foreground">
                {cancellationNote(booking.session.startsAt, now, booking.cancelHours)} Las plazas vuelven a la venta.
              </p>
              <CancelBookingButton
                bookingId={booking.id}
                code={booking.code}
                name={booking.customer.name}
                paidCents={booking.paymentStatus === "paid" ? booking.paidCents : 0}
                freeCancellation={isFreeCancellation(booking.session.startsAt, now, booking.cancelHours)}
                cancelHours={booking.cancelHours}
                className={ACTION}
              />
            </div>
          ) : null}
        </div>
      </div>

    </section>
  );
}

function Card({
  icon: Icon,
  title,
  action,
  className,
  children,
}: {
  icon?: LucideIcon;
  title?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-2xl border border-black/5 bg-surface p-4 shadow-card tablet:p-5", className)}>
      {title ? (
        <div className="mb-3 flex min-h-8 items-center justify-between gap-2">
          <h2 className={cn(SECTION_TITLE, "flex items-center gap-1.5")}>
            {Icon ? <Icon aria-hidden="true" className="size-3.5" /> : null}
            {title}
          </h2>
          {action}
        </div>
      ) : null}
      {children}
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex min-w-0 flex-col-reverse px-2">
      <dt className="text-[0.7rem] font-medium text-muted-foreground">{label}</dt>
      <dd className={cn("truncate text-[1.1rem] font-semibold tabular-nums", className)}>{value}</dd>
    </div>
  );
}

function Missing({ children }: { children: React.ReactNode }) {
  return <span className="text-faint italic">{children}</span>;
}

function Details({ items, className }: { items: [string, React.ReactNode][]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[0.88rem]", className)}>
      {items.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function StatusPill({ booking }: { booking: BookingDetail }) {
  if (booking.status === "cancelled" || booking.status === "expired") {
    return <Pill className="bg-danger-soft text-danger">Cancelada</Pill>;
  }
  if (booking.status === "pending") return <Pill tone="warn">Pago web a medias</Pill>;
  const state = arrivalState(booking);
  if (state === "no_show") return <Pill className="bg-danger-soft text-danger">No se ha presentado</Pill>;
  if (state === "partial" || state === "arrived") {
    const pax = booking.lines.reduce((sum, line) => sum + line.qty, 0);
    return <Pill tone={state === "arrived" ? "ok" : "warn"}>{arrivalLabel({ ...booking, pax })}</Pill>;
  }
  return <Pill className="bg-primary-soft text-primary">Confirmada</Pill>;
}

function PaymentPill({ booking }: { booking: BookingDetail }) {
  if (booking.paymentStatus === "paid") return <Pill tone="ok">Pagado</Pill>;
  if (booking.paymentStatus === "refunded") return <Pill>Reembolsado</Pill>;
  if (booking.paymentStatus === "invoice") return <Pill className="bg-primary-soft text-primary">A facturar</Pill>;
  return <Pill tone="warn">Pendiente</Pill>;
}
