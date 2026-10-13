"use client";

import { useState, useTransition } from "react";
import { Banknote, Check, CheckCheck, ChevronDown, CreditCard, HandCoins, Undo2, UserX, Users, X } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { toast } from "sonner";

import { checkInAll, collectPayment, setArrival, type ManifestActionResult } from "@/app/(panel)/panel/salidas/actions";
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
import { arrivalLabel, arrivalState, arrivedOf } from "@/lib/domain/manifest";
import { formatCents } from "@/lib/domain/money";
import { cn } from "@/lib/utils";

function report(result: ManifestActionResult, success?: string) {
  if (!result.ok) toast.error(result.error);
  else if (result.message ?? success) toast.success(result.message ?? success);
}

/**
 * Casilla «Llegó» del manifiesto. Un toque marca que ha llegado todo el grupo (o lo deshace); la
 * flecha permite marcar que llega solo parte del grupo o que no se ha presentado.
 */
export function ArrivalControl({
  bookingId,
  name,
  pax,
  checkedIn,
  arrivedPax,
  noShow,
}: {
  bookingId: string;
  name: string;
  pax: number;
  checkedIn: boolean;
  arrivedPax: number | null;
  noShow: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const booking = { checkedIn, arrivedPax, noShow, pax };
  const state = arrivalState(booking);
  const first = name.split(" ")[0];

  function save(arrived: number | null, success: string) {
    startTransition(async () => report(await setArrival(bookingId, arrived), success));
  }

  const partials = pax > 1 && pax <= 12 ? Array.from({ length: pax - 1 }, (_, index) => pax - 1 - index) : [];

  return (
    <div className={cn("inline-flex items-stretch", pending && "opacity-60")}>
      <button
        type="button"
        aria-label={`Check-in ${name}`}
        aria-pressed={state === "arrived" ? true : state === "partial" ? "mixed" : false}
        title={arrivalLabel(booking)}
        disabled={pending}
        onClick={() => (state === "pending" ? save(pax, `${first} · presentado`) : save(null, "Check-in deshecho"))}
        className={cn(
          "grid size-11 place-items-center rounded-l-lg border-2 border-r-0 text-[0.72rem] font-bold tabular-nums outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 tablet:size-8",
          state === "arrived" && "border-ok bg-ok text-white",
          state === "partial" && "border-[#ff9f0a] bg-[#ff9f0a] text-white",
          state === "no_show" && "border-danger bg-danger text-white",
          state === "pending" && "border-line bg-surface text-transparent hover:text-faint",
        )}
      >
        {state === "partial" ? (
          `${arrivedOf(booking)}/${pax}`
        ) : state === "no_show" ? (
          <X aria-hidden="true" className="size-4" strokeWidth={3} />
        ) : (
          <Check aria-hidden="true" className="size-4" strokeWidth={3} />
        )}
      </button>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          aria-label={`Más opciones de llegada de ${name}`}
          disabled={pending}
          className="grid h-11 w-7 place-items-center rounded-r-lg border-2 border-line bg-surface text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 tablet:h-8 tablet:w-6"
        >
          <ChevronDown aria-hidden="true" className="size-3.5" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={6}
            className="z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-[220px] overflow-y-auto rounded-xl border border-black/5 bg-surface p-1 shadow-[0_10px_30px_rgb(0_0_0/0.14)]"
          >
            <DropdownMenu.Label className="px-3 pt-1.5 pb-1 text-[0.72rem] font-semibold text-muted-foreground">{name}</DropdownMenu.Label>
            <DropdownMenu.Item className={menuItemClass} onSelect={() => save(pax, `${first} · presentado`)}>
              <Check aria-hidden="true" />
              {pax === 1 ? "Ha llegado" : `Han llegado los ${pax}`}
            </DropdownMenu.Item>
            {partials.map((count) => (
              <DropdownMenu.Item key={count} className={menuItemClass} onSelect={() => save(count, `${first} · llegan ${count} de ${pax}`)}>
                <Users aria-hidden="true" />
                Llegan {count} de {pax}
              </DropdownMenu.Item>
            ))}
            <DropdownMenu.Item className={menuItemClass} onSelect={() => save(0, `${first} · no se ha presentado`)}>
              <UserX aria-hidden="true" />
              No se ha presentado
            </DropdownMenu.Item>
            {state !== "pending" ? (
              <DropdownMenu.Item className={menuItemClass} onSelect={() => save(null, "Check-in deshecho")}>
                <Undo2 aria-hidden="true" />
                Aún no ha llegado
              </DropdownMenu.Item>
            ) : null}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}

const menuItemClass = cn(
  "flex min-h-11 cursor-default items-center gap-2.5 rounded-lg px-3 text-[0.9rem] text-foreground outline-none select-none tablet:min-h-9",
  "data-[highlighted]:bg-line-2 [&_svg]:size-4 [&_svg]:text-muted-foreground",
);

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

export const PAYMENT_METHODS = [
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
  className,
}: {
  bookingId: string;
  code: string;
  totalCents: number;
  customerName: string;
  tickets: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className={cn("text-warn", className)}>
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
            {PAYMENT_METHODS.map(({ value, label, icon: Icon }) => (
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
