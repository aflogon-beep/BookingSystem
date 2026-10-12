"use client";

import { useId, useState, useTransition } from "react";
import { CalendarClock, Mail, Minus, Pencil, Plus, Undo2, UserCheck, UserX, Users, XCircle } from "lucide-react";
import { toast } from "sonner";

import {
  cancelBooking,
  moveBooking,
  resendBookingConfirmation,
  saveBookingNotes,
  updateBookingDetails,
  updateBookingLines,
  type BookingActionResult,
} from "@/app/(panel)/panel/reservas/actions";
import { setArrival } from "@/app/(panel)/panel/salidas/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { formatCents } from "@/lib/domain/money";
import { cn } from "@/lib/utils";

function report(result: BookingActionResult | { ok: true; message?: string } | { ok: false; error: string }) {
  if (!result.ok) toast.error(result.error);
  else if (result.message) toast.success(result.message);
}

/** Check-in desde la ficha: llega el grupo, no se ha presentado, o deshacer. */
export function CheckInButton({
  bookingId,
  name,
  pax,
  state,
  className,
}: {
  bookingId: string;
  name: string;
  pax: number;
  state: "pending" | "arrived" | "partial" | "no_show";
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const first = name.split(" ")[0];
  function save(arrived: number | null, message: string) {
    startTransition(async () => {
      const result = await setArrival(bookingId, arrived);
      report(result.ok ? { ok: true, message } : result);
    });
  }
  if (state !== "pending") {
    return (
      <Button variant="outline" size="sm" className={className} disabled={pending} onClick={() => save(null, "Check-in deshecho")}>
        <Undo2 aria-hidden="true" />
        Deshacer check-in
      </Button>
    );
  }
  return (
    <>
      <Button variant="outline" size="sm" className={className} disabled={pending} onClick={() => save(pax, `${first} · presentado`)}>
        <UserCheck aria-hidden="true" />
        Check-in
      </Button>
      <Button variant="outline" size="sm" className={className} disabled={pending} onClick={() => save(0, `${first} · no se ha presentado`)}>
        <UserX aria-hidden="true" />
        No se presentó
      </Button>
    </>
  );
}

export function ResendButton({ bookingId, className }: { bookingId: string; className?: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      disabled={pending}
      onClick={() => startTransition(async () => report(await resendBookingConfirmation(bookingId)))}
    >
      <Mail aria-hidden="true" />
      Reenviar
    </Button>
  );
}

/** «Cancelar»: confirma y, si estaba pagada, deja elegir si se reembolsa (por defecto, según el plazo). */
export function CancelBookingButton({
  bookingId,
  code,
  name,
  paidCents,
  freeCancellation,
  cancelHours,
  className,
}: {
  bookingId: string;
  code: string;
  name: string;
  /** Lo cobrado; 0 si no está pagada. */
  paidCents: number;
  freeCancellation: boolean;
  cancelHours: number;
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [refund, setRefund] = useState(freeCancellation);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (next) setRefund(freeCancellation);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className={cn("text-danger hover:border-danger/40 hover:bg-danger-soft", className)}>
          <XCircle aria-hidden="true" />
          Cancelar reserva
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar reserva</DialogTitle>
          <DialogDescription>
            {code} · {name}. Las plazas vuelven a estar a la venta y el cliente recibe un email.
          </DialogDescription>
        </DialogHeader>
        {paidCents > 0 ? (
          <DialogBody className="gap-1">
            <label htmlFor={`${id}-refund`} className="flex items-center gap-2.5 text-[0.9rem] font-medium">
              <input
                id={`${id}-refund`}
                type="checkbox"
                checked={refund}
                onChange={(event) => setRefund(event.target.checked)}
                className="size-[18px] accent-primary"
              />
              Reembolsar {formatCents(paidCents)}
            </label>
            <p className="text-[0.78rem] text-muted-foreground">
              {freeCancellation
                ? `Dentro del plazo de cancelación gratuita (${cancelHours} h antes).`
                : `Fuera del plazo de cancelación gratuita (${cancelHours} h antes): por defecto no se reembolsa.`}{" "}
              Devuelve el importe en efectivo o por TPV.
            </p>
          </DialogBody>
        ) : (
          <div className="pb-4" />
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={pending}>
              Volver
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await cancelBooking(bookingId, paidCents > 0 && refund);
                report(result);
                if (result.ok) setOpen(false);
              })
            }
          >
            Cancelar reserva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** «Cambiar de fecha»: salidas del mismo producto con plazas para toda la reserva. */
export function MoveBookingForm({ bookingId, options }: { bookingId: string; options: { id: string; label: string }[] }) {
  const id = useId();
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const sessionId = String(new FormData(event.currentTarget).get("session") ?? "");
        startTransition(async () => report(await moveBooking(bookingId, sessionId)));
      }}
    >
      <label htmlFor={`${id}-session`} className="text-[0.72rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
        Cambiar de fecha
      </label>
      <p className="-mt-1 text-[0.8rem] text-muted-foreground">Salidas del mismo producto con plazas para toda la reserva.</p>
      <div className="flex flex-col gap-2 tablet:flex-row">
        <NativeSelect id={`${id}-session`} name="session" className="w-full min-w-0 tablet:flex-1" disabled={pending}>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit" variant="outline" disabled={pending} className="w-full tablet:w-auto">
          <CalendarClock aria-hidden="true" />
          Mover
        </Button>
      </div>
    </form>
  );
}

/** Notas internas: se guardan al salir del campo si han cambiado. */
export function NotesField({ bookingId, notes }: { bookingId: string; notes: string }) {
  const id = useId();
  const [saved, setSaved] = useState(notes);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={`${id}-notes`} className="text-[0.72rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
        Notas internas
      </label>
      <textarea
        id={`${id}-notes`}
        rows={3}
        maxLength={2000}
        defaultValue={notes}
        disabled={pending}
        placeholder="Alergias, silla de bebé, cumpleaños…"
        onBlur={(event) => {
          const value = event.currentTarget.value.trim();
          if (value === saved) return;
          startTransition(async () => {
            const result = await saveBookingNotes(bookingId, value);
            report(result);
            if (result.ok) setSaved(value);
          });
        }}
        className="w-full rounded-[10px] border border-input bg-surface px-3 py-2 text-[0.9rem] outline-none focus-visible:border-[#66aaf0] focus-visible:ring-[3px] focus-visible:ring-primary/15"
      />
    </div>
  );
}

/** «Cambiar entradas»: más o menos personas. El total que se ve es orientativo; lo fija la BD. */
export function EditLinesButton({
  bookingId,
  options,
}: {
  bookingId: string;
  options: { id: string; name: string; priceCents: number; takesSeat: boolean; qty: number }[];
}) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [pending, startTransition] = useTransition();
  const initial = () => Object.fromEntries(options.map((option) => [option.id, option.qty]));
  const current = (id: string) => qty[id] ?? 0;
  const total = options.reduce((sum, option) => sum + current(option.id) * option.priceCents, 0);
  const seats = options.reduce((sum, option) => sum + (option.takesSeat ? current(option.id) : 0), 0);
  const unchanged = options.every((option) => current(option.id) === option.qty);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (next) setQty(initial());
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Users aria-hidden="true" />
          Cambiar entradas
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar entradas</DialogTitle>
          <DialogDescription>Las plazas se comprueban al guardar. Las entradas que ya tenía mantienen su precio.</DialogDescription>
        </DialogHeader>
        <DialogBody className="gap-2">
          {options.map((option) => (
            <div key={option.id} className="flex items-center gap-3">
              <span className="min-w-0 flex-1">
                <b className="block font-semibold">{option.name}</b>
                <span className="text-[0.8rem] text-muted-foreground tabular-nums">{formatCents(option.priceCents)}</span>
              </span>
              <div role="group" aria-label={option.name} className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label={`Quitar ${option.name}`}
                  disabled={pending || current(option.id) === 0}
                  onClick={() => setQty({ ...qty, [option.id]: current(option.id) - 1 })}
                >
                  <Minus aria-hidden="true" />
                </Button>
                <output aria-live="polite" className="w-8 text-center font-semibold tabular-nums">
                  {current(option.id)}
                </output>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label={`Añadir ${option.name}`}
                  disabled={pending || current(option.id) >= 100}
                  onClick={() => setQty({ ...qty, [option.id]: current(option.id) + 1 })}
                >
                  <Plus aria-hidden="true" />
                </Button>
              </div>
            </div>
          ))}
          <p className="mt-2 flex justify-between border-t border-line-2 pt-3 font-semibold">
            <span>Nuevo total</span>
            <span className="tabular-nums">{formatCents(total)}</span>
          </p>
          {seats === 0 ? <p className="text-[0.8rem] text-danger">Hace falta al menos una entrada con plaza.</p> : null}
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={pending}>
              Volver
            </Button>
          </DialogClose>
          <Button
            disabled={pending || unchanged || seats === 0}
            onClick={() =>
              startTransition(async () => {
                const lines = options
                  .filter((option) => current(option.id) > 0)
                  .map((option) => ({ ticketTypeId: option.id, qty: current(option.id) }));
                const result = await updateBookingLines(bookingId, lines);
                report(result);
                if (result.ok) setOpen(false);
              })
            }
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** «Editar» del contacto: nombre, email, teléfono y hotel. */
export function EditDetailsButton({
  bookingId,
  details,
  showHotel,
}: {
  bookingId: string;
  details: { name: string; email: string; phone: string; hotel: string };
  showHotel: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fields: { name: "name" | "email" | "phone" | "hotel"; label: string; type: string; autoComplete: string; max: number }[] = [
    { name: "name", label: "Nombre", type: "text", autoComplete: "name", max: 120 },
    { name: "email", label: "Email", type: "email", autoComplete: "email", max: 200 },
    { name: "phone", label: "Teléfono", type: "tel", autoComplete: "tel", max: 40 },
    ...(showHotel ? [{ name: "hotel" as const, label: "Hotel de recogida", type: "text", autoComplete: "off", max: 200 }] : []),
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="-my-1">
          <Pencil aria-hidden="true" />
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          className="flex flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const value = (name: string) => String(form.get(name) ?? "");
            startTransition(async () => {
              const result = await updateBookingDetails(bookingId, {
                name: value("name"),
                email: value("email"),
                phone: value("phone"),
                hotel: showHotel ? value("hotel") : details.hotel,
              });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              report(result);
              setOpen(false);
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Datos del cliente</DialogTitle>
            <DialogDescription>Si el cliente tiene más reservas, el cambio se ve en todas.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            {fields.map((field) => (
              <div key={field.name} className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-${field.name}`}>{field.label}</Label>
                <Input
                  id={`${id}-${field.name}`}
                  name={field.name}
                  type={field.type}
                  autoComplete={field.autoComplete}
                  maxLength={field.max}
                  required={field.name === "name"}
                  defaultValue={details[field.name]}
                />
              </div>
            ))}
            {error ? (
              <p role="alert" className="text-[0.84rem] text-danger">
                {error}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Volver
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
