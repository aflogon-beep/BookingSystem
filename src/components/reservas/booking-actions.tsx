"use client";

import { useId, useState, useTransition } from "react";
import { CalendarClock, Mail, Undo2, UserCheck } from "lucide-react";
import { toast } from "sonner";

import {
  cancelBooking,
  moveBooking,
  resendBookingConfirmation,
  saveBookingNotes,
  type BookingActionResult,
} from "@/app/(panel)/panel/reservas/actions";
import { setCheckedIn } from "@/app/(panel)/panel/salidas/actions";
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
import { NativeSelect } from "@/components/ui/native-select";
import { formatCents } from "@/lib/domain/money";

function report(result: BookingActionResult | { ok: true; message?: string } | { ok: false; error: string }) {
  if (!result.ok) toast.error(result.error);
  else if (result.message) toast.success(result.message);
}

export function CheckInButton({ bookingId, checked, name }: { bookingId: string; checked: boolean; name: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await setCheckedIn(bookingId, !checked);
          report(result.ok ? { ok: true, message: checked ? "Check-in deshecho" : `${name.split(" ")[0]} · presentado` } : result);
        })
      }
    >
      {checked ? <Undo2 aria-hidden="true" /> : <UserCheck aria-hidden="true" />}
      {checked ? "Deshacer check-in" : "Check-in"}
    </Button>
  );
}

export function ResendButton({ bookingId }: { bookingId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
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
}: {
  bookingId: string;
  code: string;
  name: string;
  /** Lo cobrado; 0 si no está pagada. */
  paidCents: number;
  freeCancellation: boolean;
  cancelHours: number;
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
        <Button variant="outline" size="sm" className="text-danger">
          Cancelar
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
      <div className="flex gap-2">
        <NativeSelect id={`${id}-session`} name="session" className="min-w-0 flex-1" disabled={pending}>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit" variant="outline" disabled={pending}>
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
        rows={2}
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
