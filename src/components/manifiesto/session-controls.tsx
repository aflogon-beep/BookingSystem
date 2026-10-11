"use client";

import { useId, useState, useTransition } from "react";
import { CircleX, Lock, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

import { setSessionCapacity, setSessionStatus } from "@/app/(panel)/panel/salidas/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Status = "open" | "closed" | "cancelled";

// Cancelar va aparte, en rojo y con confirmación: no es un estado más entre los que se alterna.
const OPTIONS: { value: Exclude<Status, "cancelled">; label: string; icon: typeof Lock }[] = [
  { value: "open", label: "A la venta", icon: ShoppingCart },
  { value: "closed", label: "Cerrar venta", icon: Lock },
];

/** Estado (a la venta, cerrada, cancelada) y aforo de una salida, en el lateral del manifiesto. */
export function SessionControls({
  sessionId,
  status,
  capacity,
  booked,
}: {
  sessionId: string;
  status: Status;
  capacity: number;
  booked: number;
}) {
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [confirmCancel, setConfirmCancel] = useState(false);

  function changeStatus(next: Status) {
    startTransition(async () => {
      const result = await setSessionStatus(sessionId, next);
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
      setConfirmCancel(false);
    });
  }

  function saveCapacity(raw: string) {
    const value = Number(raw);
    if (!raw || value === capacity) return;
    startTransition(async () => {
      const result = await setSessionCapacity(sessionId, value);
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {status === "cancelled" ? (
        <p className="flex items-center gap-2 rounded-[10px] bg-danger-soft px-3 py-2.5 text-[0.86rem] font-medium text-danger">
          <CircleX aria-hidden="true" className="size-4 shrink-0" />
          Salida cancelada. No se puede volver a abrir.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <span aria-hidden="true" className="text-[0.8rem] font-medium text-[#2a3644]">
            Estado de venta
          </span>
          <div
            role="group"
            aria-label="Estado de la salida"
            className="flex gap-0.5 rounded-[11px] bg-[#e8e8ed] p-[3px]"
          >
            {OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={status === option.value}
                disabled={pending}
                onClick={() => option.value !== status && changeStatus(option.value)}
                className={cn(
                  "flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-[0.84rem] font-medium text-muted-foreground disabled:opacity-60 tablet:min-h-9",
                  "aria-pressed:bg-surface aria-pressed:text-primary aria-pressed:shadow-[0_1px_2px_rgb(16_24_40/0.12)]",
                )}
              >
                <option.icon aria-hidden="true" className="size-4 shrink-0" />
                {option.label}
              </button>
            ))}
          </div>
          <p className="text-[0.75rem] text-faint">
            {status === "open" ? "Se puede reservar en la web y en el panel." : "No admite reservas nuevas, ni en la web ni en el panel."}
          </p>
        </div>
      )}

      <form
        className="flex flex-col gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          saveCapacity(String(new FormData(event.currentTarget).get("capacity") ?? ""));
        }}
      >
        <Label htmlFor={`${id}-capacity`}>Aforo de esta salida</Label>
        <div className="flex gap-2">
          <Input
            key={capacity}
            id={`${id}-capacity`}
            name="capacity"
            type="number"
            inputMode="numeric"
            min={Math.max(booked, 1)}
            max={500}
            defaultValue={capacity}
            aria-describedby={`${id}-capacity-hint`}
            className="w-24"
            disabled={status === "cancelled"}
          />
          <span className="self-center text-[0.84rem] text-muted-foreground">plazas</span>
          <Button type="submit" variant="outline" disabled={pending || status === "cancelled"}>
            Guardar
          </Button>
        </div>
        <p id={`${id}-capacity-hint`} className="text-[0.75rem] text-faint">
          Solo cambia esta salida. El aforo general está en el producto.
        </p>
      </form>

      {status === "cancelled" ? null : (
        <div className="border-t border-line-2 pt-3">
          <Button
            type="button"
            variant="ghost"
            className="-ml-2 text-danger hover:bg-danger-soft hover:text-danger"
            disabled={pending}
            onClick={() => setConfirmCancel(true)}
          >
            <CircleX aria-hidden="true" />
            Cancelar salida
          </Button>
        </div>
      )}

      <Dialog open={confirmCancel} onOpenChange={(open) => !pending && setConfirmCancel(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Cancelar esta salida?</DialogTitle>
            <DialogDescription>
              {booked > 0
                ? `Se cancelarán sus reservas (${booked} ${booked === 1 ? "plaza" : "plazas"}). `
                : "No tiene reservas. "}
              Lo cobrado queda reembolsado (devuélvelo en efectivo o por TPV) y cada cliente recibe un email. Una
              salida cancelada no se puede volver a abrir.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={pending}>
                Volver
              </Button>
            </DialogClose>
            <Button variant="destructive" disabled={pending} onClick={() => changeStatus("cancelled")}>
              Cancelar salida
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
