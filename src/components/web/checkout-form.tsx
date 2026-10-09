"use client";

import { useId, useState, useTransition } from "react";
import { Check, Wallet } from "lucide-react";

import { unstable_rethrow } from "next/navigation";

import { createWebBooking } from "@/app/(public)/experiencias/[slug]/reservar/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Locale } from "@/lib/domain/i18n";
import { webText } from "@/lib/domain/web-text";
import { cn } from "@/lib/utils";

/**
 * Datos del cliente y confirmación. Sin pasarela de pago: la reserva queda confirmada y se paga
 * el día del tour.
 */
export function WebCheckoutForm({
  locale,
  slug,
  sessionId,
  lines,
  totalCents,
  totalLabel,
  pickup,
  meetingPoint,
  cancelHours,
}: {
  locale: Locale;
  slug: string;
  sessionId: string;
  lines: { ticketTypeId: string; qty: number }[];
  totalCents: number;
  totalLabel: string;
  pickup: boolean;
  meetingPoint: string;
  cancelHours: number;
}) {
  const id = useId();
  const text = webText(locale);
  const [customer, setCustomer] = useState({ name: "", email: "", phone: "", hotel: "", trap: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const field = (name: keyof typeof customer) => ({
    id: `${id}-${name}`,
    name,
    value: customer[name],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => setCustomer({ ...customer, [name]: event.target.value }),
  });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          try {
            // Si sale bien, el servidor lleva a la confirmación.
            const result = await createWebBooking({ locale, slug, sessionId, lines, expectedTotalCents: totalCents, customer });
            setError(result.error);
          } catch (caught) {
            unstable_rethrow(caught);
            setError(text.errors.generic);
          }
        });
      }}
    >
      <Field label={text.fullName} optionalLabel={text.optional}>
        <Input required autoComplete="name" maxLength={120} {...field("name")} />
      </Field>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
        <Field label={text.email} optionalLabel={text.optional}>
          <Input type="email" required autoComplete="email" maxLength={254} {...field("email")} />
        </Field>
        <Field label={text.phone} optionalLabel={text.optional} optional>
          <Input type="tel" autoComplete="tel" maxLength={40} {...field("phone")} />
        </Field>
      </div>
      {pickup ? (
        <Field label={text.pickupHotel} optionalLabel={text.optional} optional>
          <Input
            maxLength={200}
            placeholder={text.hotelPlaceholder(meetingPoint)}
            {...field("hotel")}
          />
        </Field>
      ) : null}
      {/* Campo trampa: las personas no lo ven; los bots lo rellenan. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor={`${id}-trap`}>{text.trapLabel}</label>
        <input tabIndex={-1} autoComplete="off" {...field("trap")} />
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 p-3.5">
        <Wallet aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="text-[0.86rem]">
          <b className="font-semibold">{text.payOnTheDay}</b>
          <p className="text-muted-foreground">
            {text.payOnTheDayText}
            {cancelHours > 0 ? ` ${text.freeCancellation(cancelHours)}` : ""}
          </p>
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-[10px] bg-danger-soft px-3 py-2 text-[0.86rem] text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={pending}>
        <Check aria-hidden="true" />
        {pending ? text.booking : text.confirmBooking(totalLabel)}
      </Button>
      <p className="text-[0.75rem] text-faint">
        {text.privacy}
      </p>
    </form>
  );
}

function Field({
  label,
  optionalLabel,
  optional = false,
  className,
  children,
}: {
  label: string;
  optionalLabel: string;
  optional?: boolean;
  className?: string;
  children: React.ReactElement<{ id: string }>;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={children.props.id}>
        {label}
        {optional ? <span className="font-normal text-muted-foreground"> {optionalLabel}</span> : null}
      </Label>
      {children}
    </div>
  );
}
