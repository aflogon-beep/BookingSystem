"use client";

import { useState, useTransition } from "react";
import { Banknote, Check, CheckCheck, Copy, CreditCard, HandCoins } from "lucide-react";
import { toast } from "sonner";

import { checkInAll, collectPayment, setCheckedIn, type ManifestActionResult } from "@/app/(panel)/panel/salidas/actions";
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
import { formatCents } from "@/lib/domain/money";
import { cn } from "@/lib/utils";

function report(result: ManifestActionResult, success?: string) {
  if (!result.ok) toast.error(result.error);
  else if (result.message ?? success) toast.success(result.message ?? success);
}

/** Casilla «Llegó» del manifiesto. */
export function CheckInToggle({ bookingId, checked, name }: { bookingId: string; checked: boolean; name: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      aria-label={`Check-in ${name}`}
      aria-pressed={checked}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await setCheckedIn(bookingId, !checked);
          report(result, !checked ? `${name.split(" ")[0]} · presentado` : undefined);
        })
      }
      className={cn(
        "grid size-11 place-items-center rounded-lg border-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 tablet:size-8",
        checked ? "border-ok bg-ok text-white" : "border-line bg-surface text-transparent hover:text-faint",
        pending && "opacity-60",
      )}
    >
      <Check aria-hidden="true" className="size-4" strokeWidth={3} />
    </button>
  );
}

export function CheckAllButton({ sessionId, disabled }: { sessionId: string; disabled: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled || pending}
      onClick={() => startTransition(async () => report(await checkInAll(sessionId)))}
    >
      <CheckCheck aria-hidden="true" />
      Marcar todos
    </Button>
  );
}

const METHODS = [
  { value: "cash", label: "Efectivo", icon: Banknote },
  { value: "card_terminal", label: "TPV tarjeta", icon: CreditCard },
] as const;

/** «Cobrar X €»: elige efectivo o TPV y marca la reserva como pagada. */
export function CollectButton({
  bookingId,
  code,
  totalCents,
  customerName,
  tickets,
}: {
  bookingId: string;
  code: string;
  totalCents: number;
  customerName: string;
  tickets: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-warn">
          <HandCoins aria-hidden="true" />
          Cobrar {formatCents(totalCents)}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <span className="text-[0.72rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Cobrar reserva {code}</span>
          <DialogTitle className="text-[1.6rem] tabular-nums">{formatCents(totalCents)}</DialogTitle>
          <DialogDescription>
            {customerName} · {tickets}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div role="group" aria-label="Cómo paga" className="grid grid-cols-2 gap-2">
            {METHODS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await collectPayment(bookingId, value);
                    report(result, `Cobrado ${formatCents(totalCents)}`);
                    if (result.ok) setOpen(false);
                  })
                }
                className="flex flex-col items-start gap-1.5 rounded-xl border border-line bg-surface px-3 py-3 text-left font-semibold hover:border-primary disabled:opacity-50"
              >
                <Icon aria-hidden="true" className="size-5 text-muted-foreground" />
                {label}
              </button>
            ))}
          </div>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={pending}>
              Cancelar
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Copia el manifiesto como texto (para el guía o WhatsApp). */
export function CopyManifestButton({ text }: { text: string }) {
  return (
    <Button
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast.success("Manifiesto copiado");
        } catch {
          toast.error("No se pudo copiar. Inténtalo de nuevo.");
        }
      }}
    >
      <Copy aria-hidden="true" />
      Copiar
    </Button>
  );
}
