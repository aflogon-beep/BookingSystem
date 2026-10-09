import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";

import { CollectButton } from "@/components/manifiesto/passenger-actions";
import {
  CancelBookingButton,
  CheckInButton,
  MoveBookingForm,
  NotesField,
  ResendButton,
} from "@/components/reservas/booking-actions";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { requireAccess } from "@/lib/auth";
import { CHANNEL_LABELS, isEditable, isFreeCancellation, moveOptionLabel, paymentLabel } from "@/lib/domain/booking-detail";
import { longDayLabel, toBusinessDateTime } from "@/lib/domain/calendar";
import { formatCents } from "@/lib/domain/money";
import { BUSINESS_TIMEZONE } from "@/lib/domain/schedule";

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

/** Ficha de una reserva: datos, cobro, check-in, notas, cambio de fecha, cancelación e historial. */
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

  return (
    <section className="mx-auto flex w-full max-w-[640px] flex-col gap-4">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-1 px-1">
          <Link href={`/panel/salidas/${booking.session.id}`}>
            <ArrowLeft aria-hidden="true" />
            Manifiesto
          </Link>
        </Button>
      </div>

      <div>
        <p className="text-[0.72rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
          Reserva <span className="font-mono">{booking.code}</span>
        </p>
        <h1 className="mt-1 text-[1.25rem] tablet:text-[1.45rem]">{booking.customer.name}</h1>
        <div className="mt-2 flex flex-wrap gap-2">
          <StatusPill booking={booking} />
          <PaymentPill booking={booking} />
        </div>
      </div>

      {!cancelled ? (
        <div className="flex flex-wrap items-center gap-2">
          {booking.paymentStatus === "pending" && booking.status === "confirmed" ? (
            <CollectButton
              bookingId={booking.id}
              code={booking.code}
              totalCents={booking.totalCents}
              customerName={booking.customer.name}
              tickets={tickets}
            />
          ) : null}
          {booking.status === "confirmed" ? (
            <CheckInButton bookingId={booking.id} checked={booking.checkedIn} name={booking.customer.name} />
          ) : null}
          {booking.status === "confirmed" && booking.customer.email ? <ResendButton bookingId={booking.id} /> : null}
          {editable ? (
            <span className="ml-auto">
              <CancelBookingButton
                bookingId={booking.id}
                code={booking.code}
                name={booking.customer.name}
                paidCents={booking.paymentStatus === "paid" ? booking.paidCents : 0}
                freeCancellation={isFreeCancellation(booking.session.startsAt, now, booking.cancelHours)}
                cancelHours={booking.cancelHours}
              />
            </span>
          ) : null}
        </div>
      ) : null}

      <Link
        href={`/panel/salidas/${booking.session.id}`}
        className="flex items-center gap-3 rounded-2xl border border-black/5 bg-surface p-4 shadow-card hover:bg-surface-2"
      >
        <span aria-hidden="true" className="size-9 flex-none rounded-[9px]" style={{ background: booking.product.color }} />
        <span className="min-w-0 flex-1">
          <b className="block truncate font-semibold">{booking.product.name}</b>
          <span className="text-[0.84rem] text-muted-foreground">
            <span className="inline-block first-letter:uppercase">{longDayLabel(date)}</span> · <span className="tabular-nums">{time}</span>{" "}
            · {booking.session.language.toUpperCase()}
          </span>
        </span>
        <ChevronRight aria-hidden="true" className="size-5 text-faint" />
      </Link>

      <div className="flex flex-col gap-5 rounded-2xl border border-black/5 bg-surface p-4 shadow-card">
        <Details
          items={[
            ["Entradas", tickets],
            ["Total", <span key="total" className="tabular-nums">{formatCents(booking.totalCents)}</span>],
            ["Pago", paymentLabel(booking)],
            ["Canal", `${CHANNEL_LABELS[booking.channel] ?? booking.channel}${booking.agent ? ` · ${booking.agent}` : ""}`],
            ...(booking.product.pickup ? [["Recogida", booking.hotel || "Punto de encuentro"] as [string, React.ReactNode]] : []),
          ]}
        />
        <div>
          <h2 className="mb-2 text-[0.72rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Contacto</h2>
          <Details
            items={[
              ["Email", booking.customer.email || "—"],
              ["Teléfono", <span key="phone" className="font-mono">{booking.customer.phone || "—"}</span>],
            ]}
          />
        </div>
        <NotesField bookingId={booking.id} notes={booking.notes} />
        {editable && booking.moveOptions.length ? (
          <MoveBookingForm
            bookingId={booking.id}
            options={booking.moveOptions.map((option) => ({ id: option.id, label: moveOptionLabel(option) }))}
          />
        ) : null}
        <div>
          <h2 className="mb-2 text-[0.72rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Historial</h2>
          <ol className="flex flex-col gap-2.5 border-l-2 border-line-2 pl-3.5 text-[0.86rem]">
            {booking.events.map((event) => (
              <li key={event.id}>
                {event.text}
                <small className="block text-[0.75rem] text-faint">
                  {dateTime.format(new Date(event.at))} · {event.actor}
                </small>
              </li>
            ))}
          </ol>
        </div>
      </div>

    </section>
  );
}

function Details({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[0.88rem]">
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
  if (booking.checkedIn) return <Pill tone="ok">Presentado</Pill>;
  return <Pill className="bg-primary-soft text-primary">Confirmada</Pill>;
}

function PaymentPill({ booking }: { booking: BookingDetail }) {
  if (booking.paymentStatus === "paid") return <Pill tone="ok">Pagado</Pill>;
  if (booking.paymentStatus === "refunded") return <Pill>Reembolsado</Pill>;
  if (booking.paymentStatus === "invoice") return <Pill className="bg-primary-soft text-primary">A facturar</Pill>;
  return <Pill tone="warn">Pendiente</Pill>;
}
