"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { canAddTicket, selectedSeats } from "@/lib/domain/booking-form";
import { localizedPath, type Locale } from "@/lib/domain/i18n";
import { formatCents } from "@/lib/domain/money";
import { bookingTotal } from "@/lib/domain/pricing";
import { ticketsParam } from "@/lib/domain/storefront";
import { WEB_MAX_SEATS } from "@/lib/domain/web-checkout";
import { webText } from "@/lib/domain/web-text";

type Ticket = { id: string; name: string; note: string; takesSeat: boolean; priceCents: number };

/**
 * Entradas de la salida elegida, con el total y «Continuar» al pago. El total es orientativo:
 * el servidor vuelve a calcular precios y plazas al crear la reserva.
 */
export function TicketPicker({
  locale,
  slug,
  sessionId,
  free,
  tickets,
}: {
  locale: Locale;
  slug: string;
  sessionId: string;
  free: number;
  tickets: readonly Ticket[];
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const lines = tickets.map((ticket) => ({ ticket, qty: quantities[ticket.id] ?? 0 })).filter((line) => line.qty > 0);
  const total = bookingTotal(lines.map((line) => ({ qty: line.qty, unitPriceCents: line.ticket.priceCents })));
  const seats = selectedSeats(tickets, quantities);
  const ready = seats > 0;
  const limit = Math.min(free, WEB_MAX_SEATS);
  const full = seats >= limit;
  const text = webText(locale);
  const href = localizedPath(
    locale,
    `/experiencias/${slug}/reservar?${new URLSearchParams({ salida: sessionId, entradas: ticketsParam(quantities) })}`,
  );

  function change(ticketId: string, delta: 1 | -1) {
    setQuantities((current) => ({ ...current, [ticketId]: Math.max(0, (current[ticketId] ?? 0) + delta) }));
  }

  return (
    <section aria-labelledby="entradas" className="flex flex-col gap-3">
      <h2 id="entradas" className="sr-only">
        {text.tickets}
      </h2>
      <ul className="flex flex-col">
        {tickets.map((ticket) => {
          const qty = quantities[ticket.id] ?? 0;
          return (
            <li key={ticket.id} className="flex items-center justify-between gap-2.5 border-b border-line-2 py-2.5 last:border-b-0">
              <div className="min-w-0">
                <b className="font-semibold">{ticket.name}</b>
                {ticket.note ? <div className="text-[0.8rem] text-muted-foreground">{ticket.note}</div> : null}
              </div>
              <div className="flex items-center gap-3">
                <span className="tabular-nums">{formatCents(ticket.priceCents, locale)}</span>
                <div className="inline-flex items-center overflow-hidden rounded-lg border border-line bg-surface">
                  <StepButton label={text.removeTicket(ticket.name)} disabled={qty === 0} onClick={() => change(ticket.id, -1)}>
                    <Minus aria-hidden="true" />
                  </StepButton>
                  <output aria-label={text.ticketQty(ticket.name)} className="w-[30px] text-center text-[0.86rem] tabular-nums">
                    {qty}
                  </output>
                  <StepButton
                    label={text.addTicket(ticket.name)}
                    disabled={!canAddTicket(ticket, tickets, quantities, limit)}
                    onClick={() => change(ticket.id, 1)}
                  >
                    <Plus aria-hidden="true" />
                  </StepButton>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {full ? (
        <p role="status" className="text-[0.8rem] text-warn">
          {free <= WEB_MAX_SEATS ? text.onlyLeft(free) : text.groupLimit(WEB_MAX_SEATS)}
        </p>
      ) : null}
      <p className="flex items-baseline justify-between border-t border-line pt-2.5">
        <span>{text.total}</span>
        <b className="text-[1.4rem] font-semibold tabular-nums">{formatCents(total, locale)}</b>
      </p>
      {ready ? (
        <Button asChild size="lg">
          <Link href={href}>{text.continue}</Link>
        </Button>
      ) : (
        <Button size="lg" disabled>
          {text.continue}
        </Button>
      )}
    </section>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-11 place-items-center text-foreground hover:bg-surface-2 disabled:text-[#c3cbd4] tablet:size-8 [&_svg]:size-4"
    >
      {children}
    </button>
  );
}
