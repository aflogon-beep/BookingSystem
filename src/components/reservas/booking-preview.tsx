"use client";

import Link from "next/link";
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown, ChevronRight, ChevronUp, Clock3, ExternalLink, MapPin, StickyNote } from "lucide-react";
import { toast } from "sonner";

import { loadBookingPreview, type BookingPreview } from "@/app/(panel)/panel/reservas/preview-actions";
import { ContactButtons } from "@/components/contact-buttons";
import { CollectButton } from "@/components/manifiesto/passenger-actions";
import { CheckInButton } from "@/components/reservas/booking-actions";
import { BookingArrivalPill, PaymentPill } from "@/components/reservas/booking-pills";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { avatarColor, initials } from "@/lib/avatar";
import { balanceSummary, CHANNEL_LABELS } from "@/lib/domain/booking-detail";
import { adjacentCode, opensPreview, positionLabel, previewStep } from "@/lib/domain/booking-preview";
import { longDayLabel, toBusinessDateTime } from "@/lib/domain/calendar";
import { arrivalState } from "@/lib/domain/manifest";
import { formatCents } from "@/lib/domain/money";
import { BUSINESS_TIMEZONE } from "@/lib/domain/schedule";
import { cn } from "@/lib/utils";

type PreviewContext = { current: string | null; open: (code: string) => void };

const Context = createContext<PreviewContext>({
  current: null,
  open: () => {},
});

const SECTION_TITLE = "text-[0.72rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase";

const eventTime = new Intl.DateTimeFormat("es-ES", {
  timeZone: BUSINESS_TIMEZONE,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

// Desde tablet el panel va a la derecha y deja usar el listado; en móvil sube desde abajo.
const WIDE = "(min-width: 600px)";
function subscribeWide(onChange: () => void) {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
function useWide(): boolean {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function rowLink(code: string): HTMLAnchorElement | null {
  return document.querySelector<HTMLAnchorElement>(`a[data-preview="${code}"]`);
}

/**
 * Vista previa lateral del listado de reservas: un clic en una fila enseña lo importante (cliente,
 * salida, entradas, cobro, check-in y contacto) sin salir del listado. Con ↑/↓ o j/k se pasa a la
 * reserva de al lado. `items` trae, por fila, su código y su huella: si la huella cambia (tras un
 * check-in o un cobro), la vista previa se vuelve a cargar.
 */
export function BookingPreviewProvider({ items, children }: { items: { code: string; stamp: string }[]; children: React.ReactNode }) {
  const [current, setCurrent] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    code: string;
    stamp: string;
    data: BookingPreview | null;
  } | null>(null);
  const cache = useRef(new Map<string, { stamp: string; data: BookingPreview | null }>());
  const wide = useWide();

  const codes = useMemo(() => items.map((item) => item.code), [items]);
  const stamps = useMemo(() => new Map(items.map((item) => [item.code, item.stamp])), [items]);
  const stamp = current ? (stamps.get(current) ?? "") : "";

  useEffect(() => {
    if (!current) return;
    const cached = cache.current.get(current);
    if (cached && cached.stamp === stamp) {
      setPreview({ code: current, ...cached });
      return;
    }
    let cancelled = false;
    loadBookingPreview(current)
      .then((data) => {
        cache.current.set(current, { stamp, data });
        if (!cancelled) setPreview({ code: current, stamp, data });
      })
      .catch(() => {
        if (!cancelled) toast.error("No se pudo cargar la reserva.");
      });
    return () => {
      cancelled = true;
    };
  }, [current, stamp]);

  const open = useCallback((code: string) => setCurrent(code), []);

  const step = useCallback(
    (direction: -1 | 1) => {
      if (!current) return;
      const next = adjacentCode(codes, current, direction);
      if (!next) return;
      setCurrent(next);
      rowLink(next)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    },
    [codes, current],
  );

  useEffect(() => {
    if (!current) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      // Con un diálogo encima (cobrar) las flechas son suyas.
      if (document.querySelectorAll("[role=dialog]").length > 1) return;
      const direction = previewStep(event.key);
      if (!direction) return;
      event.preventDefault();
      step(direction);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [current, step]);

  const shown = preview && preview.code === current ? preview.data : undefined;
  const value = useMemo(() => ({ current, open }), [current, open]);

  return (
    <Context value={value}>
      {children}
      <Sheet
        open={current !== null}
        onOpenChange={(next) => {
          if (!next) setCurrent(null);
        }}
        // En pantallas anchas el listado sigue vivo: se puede pulsar otra fila con el panel abierto.
        modal={!wide}
      >
        <SheetContent
          side={wide ? "right" : "bottom"}
          className={cn("gap-0 p-0", wide ? "w-full max-w-[420px] border-black/5 shadow-[-12px_0_40px_rgb(0_0_0/0.12)]" : "max-h-[88dvh]")}
          onInteractOutside={(event) => {
            // Pulsar otra fila cambia de reserva en vez de cerrar.
            const target = event.target;
            if (target instanceof Element && target.closest("a[data-preview]")) event.preventDefault();
          }}
          onOpenAutoFocus={(event) => {
            if (wide) event.preventDefault();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (current) rowLink(current)?.focus();
          }}
        >
          {shown === undefined ? (
            <PreviewSkeleton />
          ) : shown === null ? (
            <div className="p-6 pt-14">
              <SheetTitle>Reserva no encontrada</SheetTitle>
              <SheetDescription className="mt-1">Puede que la hayan borrado. Recarga el listado.</SheetDescription>
            </div>
          ) : (
            <PreviewBody key={shown.code} booking={shown} />
          )}
          {current ? <PreviewFooter code={current} codes={codes} onStep={step} /> : null}
        </SheetContent>
      </Sheet>
    </Context>
  );
}

/**
 * Enlace a la ficha que, con un clic normal, abre la vista previa. Con Ctrl/Cmd o el botón central
 * abre la ficha en otra pestaña, como cualquier enlace.
 */
export function BookingPreviewLink({ code, className, children }: { code: string; className?: string; children: React.ReactNode }) {
  const { current, open } = use(Context);
  return (
    <Link
      href={`/panel/reservas/${code}`}
      data-preview={code}
      data-no-progress
      aria-current={current === code ? "true" : undefined}
      className={className}
      onClick={(event) => {
        if (!opensPreview(event)) return;
        event.preventDefault();
        open(code);
      }}
    >
      {children}
    </Link>
  );
}

function PreviewBody({ booking }: { booking: BookingPreview }) {
  const { date, time } = toBusinessDateTime(booking.session.startsAt);
  const balance = balanceSummary(booking);
  const confirmed = booking.status === "confirmed";
  const canCollect = booking.paymentStatus === "pending" && confirmed;
  const tickets = booking.lines.map((line) => `${line.qty} ${line.name}`).join(" · ");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300">
      <div aria-hidden="true" className="h-1.5 flex-none" style={{ background: booking.product.color }} />
      <div className="flex flex-col gap-4 p-4 tablet:p-5">
        {/* Cabecera: quién y en qué estado. Deja sitio a la X de cerrar. */}
        <div className="flex items-start gap-3 pr-10">
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
            <SheetTitle className="mt-0.5 text-[1.2rem] leading-tight break-words">{booking.customer.name}</SheetTitle>
            <SheetDescription className="sr-only">Vista previa de la reserva {booking.code}</SheetDescription>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <BookingArrivalPill booking={booking} />
              <PaymentPill paymentStatus={booking.paymentStatus} />
            </div>
          </div>
        </div>

        <dl className="grid grid-cols-3 divide-x divide-line-2 rounded-xl bg-surface-2 py-3 text-center">
          <Stat label="Personas" value={String(booking.pax)} />
          <Stat label="Total" value={formatCents(booking.totalCents)} />
          <Stat
            label={balance.label}
            value={balance.value}
            className={cn(balance.tone === "ok" && "text-ok", balance.tone === "warn" && "text-warn")}
          />
        </dl>

        <div>
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
          {booking.product.pickup ? (
            <p className="mt-1 flex items-start gap-1.5 text-[0.8rem] text-muted-foreground">
              <MapPin aria-hidden="true" className="mt-0.5 size-3.5 flex-none" />
              <span className="min-w-0 break-words">Recogida: {booking.hotel || "punto de encuentro"}</span>
            </p>
          ) : null}
        </div>

        {confirmed ? (
          <div role="group" aria-label="Acciones rápidas" className="grid grid-cols-2 gap-2">
            {canCollect ? (
              <CollectButton
                bookingId={booking.id}
                code={booking.code}
                totalCents={booking.totalCents}
                customerName={booking.customer.name}
                tickets={tickets}
                className="col-span-2 h-11 w-full border-warn/30 bg-warn-soft font-semibold hover:bg-warn-soft tablet:h-10"
              />
            ) : null}
            <CheckInButton
              bookingId={booking.id}
              name={booking.customer.name}
              pax={booking.pax}
              state={arrivalState(booking)}
              className="h-11 w-full tablet:h-10 [&:only-child]:col-span-2"
            />
          </div>
        ) : null}

        {booking.customer.phone || booking.customer.email ? (
          <ContactButtons
            name={booking.customer.name}
            phone={booking.customer.phone}
            email={booking.customer.email}
            className="[&>*]:flex-1"
          />
        ) : null}

        <section aria-label="Entradas" className="rounded-xl border border-line-2 p-3">
          <ul className="flex flex-col gap-1.5 text-[0.88rem]">
            {booking.lines.map((line, index) => (
              <li key={`${index}-${line.name}`} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0">
                  <b className="font-semibold tabular-nums">{line.qty}</b> × {line.name}
                </span>
                <span className="tabular-nums">{formatCents(line.qty * line.unitCents)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 flex items-baseline justify-between border-t border-line-2 pt-2 text-[0.8rem] text-muted-foreground">
            <span>
              {CHANNEL_LABELS[booking.channel] ?? booking.channel}
              {booking.agent ? ` · ${booking.agent}` : ""}
            </span>
            <span className="font-semibold text-foreground tabular-nums">{formatCents(booking.totalCents)}</span>
          </p>
        </section>

        {booking.notes ? (
          <p className="flex gap-2 rounded-xl bg-warn-soft/60 px-3 py-2.5 text-[0.84rem]">
            <StickyNote aria-hidden="true" className="mt-0.5 size-4 flex-none text-warn" />
            <span className="min-w-0 break-words whitespace-pre-line">{booking.notes}</span>
          </p>
        ) : null}

        {booking.events.length ? (
          <section aria-label="Últimos movimientos">
            <h3 className={cn(SECTION_TITLE, "mb-2")}>Últimos movimientos</h3>
            <ol className="flex flex-col">
              {booking.events.map((event, index) => (
                <li key={event.id} className="relative flex gap-3 pb-3 last:pb-0">
                  {index < booking.events.length - 1 ? (
                    <span aria-hidden="true" className="absolute top-3 bottom-0 left-[4.5px] w-px bg-line" />
                  ) : null}
                  <span
                    aria-hidden="true"
                    className={cn("mt-1.5 size-2.5 flex-none rounded-full", index === 0 ? "bg-primary" : "bg-line")}
                  />
                  <span className="min-w-0 text-[0.84rem] break-words">
                    {event.text}
                    <small className="mt-0.5 flex items-center gap-1 text-[0.74rem] text-faint">
                      <Clock3 aria-hidden="true" className="size-3" />
                      {eventTime.format(new Date(event.at))} · {event.actor}
                    </small>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function PreviewFooter({ code, codes, onStep }: { code: string; codes: string[]; onStep: (direction: -1 | 1) => void }) {
  const position = positionLabel(codes, code);
  return (
    <div className="flex flex-none items-center gap-2 border-t border-line-2 bg-surface p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Reserva anterior"
          title="Anterior (↑ o k)"
          disabled={!adjacentCode(codes, code, -1)}
          onClick={() => onStep(-1)}
        >
          <ChevronUp aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Reserva siguiente"
          title="Siguiente (↓ o j)"
          disabled={!adjacentCode(codes, code, 1)}
          onClick={() => onStep(1)}
        >
          <ChevronDown aria-hidden="true" />
        </Button>
        {position ? <span className="ml-1 text-[0.76rem] whitespace-nowrap text-muted-foreground tabular-nums">{position}</span> : null}
      </div>
      <Button asChild className="ml-auto">
        <Link href={`/panel/reservas/${code}`}>
          Abrir ficha
          <ExternalLink aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}

function PreviewSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-1 flex-col gap-4 p-5 pt-6">
      <SheetTitle className="sr-only">Cargando reserva</SheetTitle>
      <SheetDescription className="sr-only">Cargando la vista previa de la reserva</SheetDescription>
      <div className="flex items-center gap-3 pr-10">
        <span className="size-12 flex-none animate-pulse rounded-full bg-line-2" />
        <span className="flex flex-1 flex-col gap-2">
          <span className="h-3 w-24 animate-pulse rounded bg-line-2" />
          <span className="h-5 w-40 animate-pulse rounded bg-line-2" />
        </span>
      </div>
      <span className="h-16 animate-pulse rounded-xl bg-line-2" />
      <span className="h-12 animate-pulse rounded-xl bg-line-2" />
      <span className="h-24 animate-pulse rounded-xl bg-line-2" />
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex min-w-0 flex-col-reverse px-2">
      <dt className="text-[0.7rem] font-medium text-muted-foreground">{label}</dt>
      <dd className={cn("truncate text-[1.05rem] font-semibold tabular-nums", className)}>{value}</dd>
    </div>
  );
}
