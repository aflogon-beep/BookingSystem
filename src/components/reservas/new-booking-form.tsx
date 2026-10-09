"use client";

import { useEffect, useId, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Banknote,
  Check,
  Clock,
  CreditCard,
  Handshake,
  Link2,
  Minus,
  Phone,
  Plus,
  ReceiptText,
  Store,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { createInternalBooking, loadDaySessions } from "@/app/(panel)/panel/reservas/actions";
import { ProductArt } from "@/components/productos/product-art";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  CHANNELS,
  canAddTicket,
  defaultPayment,
  paymentNote,
  paymentOptions,
  type InternalChannel,
  type PaymentOption,
} from "@/lib/domain/booking-form";
import { calendarHref, longDayLabel } from "@/lib/domain/calendar";
import { formatCents } from "@/lib/domain/money";
import { bookingTotal } from "@/lib/domain/pricing";
import { cn } from "@/lib/utils";

import type { DaySession, NewBookingInitial, NewBookingProduct } from "./types";

const CHANNEL_ICONS: Record<InternalChannel, LucideIcon> = { phone: Phone, desk: Store, agency: Handshake };
const PAYMENT_ICONS: Record<PaymentOption, LucideIcon> = {
  card_terminal: CreditCard,
  cash: Banknote,
  payment_link: Link2,
  on_site: Clock,
  invoice: ReceiptText,
};

const LANGUAGE_NAMES: Record<string, string> = { es: "Español", en: "Inglés", de: "Alemán", fr: "Francés", it: "Italiano" };

function firstTicket(product: NewBookingProduct | undefined): Record<string, number> {
  const ticket = product?.tickets[0];
  return ticket ? { [ticket.id]: 1 } : {};
}

function isBookable(session: DaySession): boolean {
  return session.status === "open" && !session.past && session.free > 0;
}

function sessionNote(session: DaySession): string {
  const language = LANGUAGE_NAMES[session.language] ?? session.language.toUpperCase();
  if (session.status === "cancelled") return `${language} · Cancelada`;
  if (session.status === "closed") return `${language} · Cerrada`;
  if (session.past) return `${language} · Ya salió`;
  return `${language} · ${session.free > 0 ? `${session.free} libres` : "Completa"}`;
}

/**
 * Nueva reserva interna (teléfono, mostrador o agencia), como el prototipo: salida, entradas,
 * cliente, canal y cobro, con el resumen al lado. En el modal, al terminar vuelve atrás; en la
 * página, lleva a la semana de la salida en el calendario.
 */
export function NewBookingForm({
  products,
  today,
  initial,
  mode,
}: {
  products: readonly NewBookingProduct[];
  today: string;
  initial: NewBookingInitial | null;
  mode: "modal" | "page";
}) {
  const router = useRouter();
  const id = useId();
  const [productId, setProductId] = useState(initial?.productId ?? "");
  const [date, setDate] = useState(initial?.date ?? today);
  const [sessionId, setSessionId] = useState<string | null>(initial?.sessionId ?? null);
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    firstTicket(products.find((product) => product.id === initial?.productId)),
  );
  const [day, setDay] = useState<{ key: string; sessions: DaySession[] } | null>(null);
  const [reload, setReload] = useState(0);
  const [customer, setCustomer] = useState({ name: "", email: "", phone: "", hotel: "", notes: "" });
  const [channel, setChannel] = useState<InternalChannel>("phone");
  const [payment, setPayment] = useState<PaymentOption>("card_terminal");
  const [agent, setAgent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const product = products.find((candidate) => candidate.id === productId);
  const dayKey = `${productId}|${date}|${reload}`;
  const sessions = day?.key === dayKey ? day.sessions : null;
  const session = sessions?.find((candidate) => candidate.id === sessionId && isBookable(candidate)) ?? null;

  useEffect(() => {
    if (!productId || !date) return;
    let cancelled = false;
    loadDaySessions(productId, date)
      .then((loaded) => {
        if (!cancelled) setDay({ key: dayKey, sessions: loaded });
      })
      .catch(() => {
        if (!cancelled) setDay({ key: dayKey, sessions: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [productId, date, dayKey]);

  if (!product) {
    return (
      <p className="px-5 py-10 text-center text-[0.9rem] text-muted-foreground">
        No hay productos a la venta. Crea uno en Productos para poder reservar.
      </p>
    );
  }

  const tickets = product.tickets;
  const lines = tickets
    .map((ticket) => ({ ticket, qty: quantities[ticket.id] ?? 0 }))
    .filter((line) => line.qty > 0);
  const total = bookingTotal(lines.map((line) => ({ qty: line.qty, unitPriceCents: line.ticket.priceCents })));
  const canSubmit = !!session && lines.some((line) => line.ticket.takesSeat) && !pending;

  function changeProduct(next: string) {
    setProductId(next);
    setSessionId(null);
    setQuantities(firstTicket(products.find((candidate) => candidate.id === next)));
    setError(null);
  }

  function changeQuantity(ticketId: string, delta: 1 | -1) {
    setQuantities((current) => ({ ...current, [ticketId]: Math.max(0, (current[ticketId] ?? 0) + delta) }));
  }

  function changeChannel(next: InternalChannel) {
    setChannel(next);
    setPayment(defaultPayment(next));
  }

  function submit() {
    if (!session) return;
    setError(null);
    startTransition(async () => {
      const result = await createInternalBooking({
        sessionId: session.id,
        lines: lines.map((line) => ({ ticketTypeId: line.ticket.id, qty: line.qty })),
        ...customer,
        hotel: product?.pickup ? customer.hotel : "",
        channel,
        agent: channel === "agency" ? agent : "",
        payment,
      });
      if (!result.ok) {
        setError(result.error);
        // Las plazas pueden haber cambiado: vuelve a pedir las salidas del día.
        setReload((value) => value + 1);
        return;
      }
      toast.success(`Reserva ${result.code} creada`);
      if (mode === "modal") router.back();
      else router.push(calendarHref({ view: "semana", anchor: date, productId: null }));
    });
  }

  const field = (name: keyof typeof customer) => ({
    id: `${id}-${name}`,
    value: customer[name],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => setCustomer({ ...customer, [name]: event.target.value }),
  });

  return (
    <form
      className="grid min-h-0 flex-1 grid-cols-1 tablet:overflow-y-auto desk:grid-cols-[minmax(0,1fr)_290px] desk:overflow-hidden"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-col gap-5 px-5 py-[18px] desk:overflow-y-auto">
        <Section number={1} title="Salida">
          <div className="grid grid-cols-1 gap-3.5 tablet:grid-cols-[minmax(0,1.3fr)_minmax(140px,1fr)]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-product`}>Producto</Label>
              <NativeSelect id={`${id}-product`} value={productId} onChange={(event) => changeProduct(event.target.value)}>
                {products.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-date`}>Fecha</Label>
              <Input
                id={`${id}-date`}
                type="date"
                value={date}
                min={today}
                onChange={(event) => {
                  setDate(event.target.value);
                  setSessionId(null);
                  setError(null);
                }}
              />
            </div>
          </div>
          {sessions === null ? (
            <p className="p-2 text-[0.84rem] text-muted-foreground" role="status">
              Buscando salidas…
            </p>
          ) : sessions.length ? (
            <div role="group" aria-label="Salidas del día" className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-2">
              {sessions.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  aria-pressed={candidate.id === session?.id}
                  disabled={!isBookable(candidate)}
                  onClick={() => {
                    setSessionId(candidate.id);
                    setError(null);
                  }}
                  className={cn(
                    "flex flex-col gap-1 rounded-xl border border-line bg-surface px-2.5 py-[9px] text-left disabled:opacity-45",
                    "aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:shadow-[0_0_0_1px_var(--blue)]",
                  )}
                >
                  <b className="font-mono font-medium">{candidate.time}</b>
                  <small className="text-[0.72rem] text-muted-foreground">{sessionNote(candidate)}</small>
                </button>
              ))}
            </div>
          ) : (
            <p className="p-2 text-[0.84rem] text-muted-foreground">No hay salidas de este producto ese día.</p>
          )}
        </Section>

        {session ? (
          <>
            <Section number={2} title="Entradas">
              <ul aria-label="Entradas" className="flex flex-col">
                {tickets.map((ticket) => {
                  const qty = quantities[ticket.id] ?? 0;
                  return (
                    <li
                      key={ticket.id}
                      className="flex items-center justify-between gap-2.5 border-b border-line-2 py-2 last:border-b-0"
                    >
                      <div>
                        <b className="font-semibold">{ticket.name}</b>{" "}
                        <span className="text-[0.8rem] text-muted-foreground">{formatCents(ticket.priceCents)}</span>
                      </div>
                      <div className="inline-flex items-center overflow-hidden rounded-lg border border-line bg-surface">
                        <StepButton
                          label={`Quitar ${ticket.name}`}
                          disabled={qty === 0}
                          onClick={() => changeQuantity(ticket.id, -1)}
                        >
                          <Minus aria-hidden="true" />
                        </StepButton>
                        <output aria-label={`${ticket.name}: cantidad`} className="w-[30px] text-center text-[0.86rem] tabular-nums">
                          {qty}
                        </output>
                        <StepButton
                          label={`Añadir ${ticket.name}`}
                          disabled={!canAddTicket(ticket, tickets, quantities, session.free)}
                          onClick={() => changeQuantity(ticket.id, 1)}
                        >
                          <Plus aria-hidden="true" />
                        </StepButton>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Section>

            <Section number={3} title="Cliente">
              <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3.5">
                <TextField label="Nombre" className="col-span-full" required autoComplete="off" {...field("name")} />
                <TextField label="Email" type="email" autoComplete="off" {...field("email")} />
                <TextField label="Teléfono" type="tel" autoComplete="off" {...field("phone")} />
                {product.pickup ? (
                  <TextField
                    label="Hotel de recogida"
                    className="col-span-full"
                    placeholder="Vacío = punto de encuentro"
                    {...field("hotel")}
                  />
                ) : null}
                <TextField label="Nota interna" className="col-span-full" placeholder="Opcional" {...field("notes")} />
              </div>
            </Section>

            <Section number={4} title="Canal y pago">
              <OptionCards
                label="Canal"
                options={CHANNELS.map((option) => ({ ...option, icon: CHANNEL_ICONS[option.value] }))}
                value={channel}
                onChange={changeChannel}
              />
              {channel === "agency" ? (
                <TextField
                  id={`${id}-agent`}
                  label="Agencia u hotel"
                  placeholder="Ej.: Agencia Atlántica"
                  value={agent}
                  onChange={(event) => setAgent(event.target.value)}
                />
              ) : null}
              <OptionCards
                label="Cobro"
                options={paymentOptions(channel).map((option) => ({ ...option, icon: PAYMENT_ICONS[option.value] }))}
                value={payment}
                onChange={setPayment}
              />
            </Section>
          </>
        ) : null}
      </div>

      <aside
        aria-label="Resumen"
        className="flex flex-col gap-3 border-t border-line bg-surface-2 p-[18px] desk:overflow-y-auto desk:border-t-0 desk:border-l"
      >
        <div className="text-[0.68rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">Resumen</div>
        <div className="overflow-hidden rounded-2xl border border-black/5 bg-surface">
          <ProductArt seed={product.id} color={product.color} photoUrl={product.photoUrl} className="h-24" />
          <div className="flex flex-col gap-0.5 px-3 py-2.5">
            <b className="font-semibold">{product.name}</b>
            <span className="text-[0.8rem] text-muted-foreground first-letter:uppercase">
              {session ? `${longDayLabel(date)} · ${session.time} · ${session.language.toUpperCase()}` : "Elige una salida"}
            </span>
          </div>
        </div>
        {session
          ? lines.map((line) => (
              <div key={line.ticket.id} className="flex justify-between gap-2.5 text-[0.84rem]">
                <span>
                  {line.qty} × {line.ticket.name}
                </span>
                <span className="tabular-nums">{formatCents(line.qty * line.ticket.priceCents)}</span>
              </div>
            ))
          : null}
        <div className="mt-auto flex items-baseline justify-between border-t border-line pt-2.5">
          <span>Total</span>
          <b className="text-[1.4rem] font-semibold tabular-nums">{formatCents(total)}</b>
        </div>
        {session ? <p className="text-[0.8rem] text-muted-foreground">{paymentNote(payment)}</p> : null}
        {error ? (
          <p role="alert" className="rounded-[10px] bg-danger-soft px-3 py-2 text-[0.84rem] text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" size="lg" disabled={!canSubmit}>
          <Check aria-hidden="true" />
          {pending ? "Creando…" : "Confirmar reserva"}
        </Button>
      </aside>
    </form>
  );
}

function Section({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="flex items-center gap-2 text-[0.7rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        <span
          aria-hidden="true"
          className="grid size-[18px] place-items-center rounded-full bg-foreground text-[0.64rem] tracking-normal text-white"
        >
          {number}
        </span>
        {title}
      </h3>
      {children}
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

function TextField({
  label,
  className,
  ...props
}: { label: string; id: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={props.id}>{label}</Label>
      <Input {...props} />
    </div>
  );
}

function OptionCards<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string; icon: LucideIcon }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
            className={cn(
              "group flex flex-col items-start gap-[3px] rounded-xl border border-line bg-surface p-[9px] text-left text-[0.8rem] font-medium",
              "aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:shadow-[0_0_0_1px_var(--blue)]",
            )}
          >
            <Icon aria-hidden="true" className="size-5 text-muted-foreground group-aria-pressed:text-primary" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
