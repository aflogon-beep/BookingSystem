"use client";

import { useId, useState, useTransition } from "react";
import { Check, Wallet } from "lucide-react";

import { createWebBooking } from "@/app/(public)/experiencias/[slug]/reservar/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Datos del cliente y confirmación. Sin pasarela de pago: la reserva queda confirmada y se paga
 * el día del tour.
 */
export function WebCheckoutForm({
  slug,
  sessionId,
  lines,
  totalLabel,
  pickup,
  meetingPoint,
  cancelHours,
}: {
  slug: string;
  sessionId: string;
  lines: { ticketTypeId: string; qty: number }[];
  totalLabel: string;
  pickup: boolean;
  meetingPoint: string;
  cancelHours: number;
}) {
  const id = useId();
  const [customer, setCustomer] = useState({ name: "", email: "", phone: "", hotel: "", website: "" });
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
          // Si sale bien, el servidor lleva a la confirmación.
          const result = await createWebBooking({ slug, sessionId, lines, customer });
          setError(result.error);
        });
      }}
    >
      <Field label="Nombre y apellidos" className="col-span-full">
        <Input required autoComplete="name" maxLength={120} {...field("name")} />
      </Field>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
        <Field label="Email">
          <Input type="email" required autoComplete="email" maxLength={254} {...field("email")} />
        </Field>
        <Field label="Teléfono" optional>
          <Input type="tel" autoComplete="tel" maxLength={40} {...field("phone")} />
        </Field>
      </div>
      {pickup ? (
        <Field label="Hotel de recogida" optional>
          <Input
            maxLength={200}
            placeholder={meetingPoint ? `Si lo dejas vacío: ${meetingPoint}` : "Si lo dejas vacío, punto de encuentro"}
            {...field("hotel")}
          />
        </Field>
      ) : null}
      {/* Campo trampa: las personas no lo ven; los bots lo rellenan. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor={`${id}-website`}>No rellenes este campo</label>
        <input tabIndex={-1} autoComplete="off" {...field("website")} />
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 p-3.5">
        <Wallet aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="text-[0.86rem]">
          <b className="font-semibold">Pagas el día de la excursión</b>
          <p className="text-muted-foreground">
            Reservas ahora sin pagar nada y abonas el total al guía antes de salir.
            {cancelHours > 0 ? ` Cancelación gratuita hasta ${cancelHours} h antes.` : ""}
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
        {pending ? "Reservando…" : `Confirmar reserva · ${totalLabel}`}
      </Button>
      <p className="text-[0.75rem] text-faint">
        Usamos tus datos solo para gestionar esta reserva y avisarte si hay cambios.
      </p>
    </form>
  );
}

function Field({
  label,
  optional = false,
  className,
  children,
}: {
  label: string;
  optional?: boolean;
  className?: string;
  children: React.ReactElement<{ id: string }>;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={children.props.id}>
        {label}
        {optional ? <span className="font-normal text-muted-foreground"> (opcional)</span> : null}
      </Label>
      {children}
    </div>
  );
}
