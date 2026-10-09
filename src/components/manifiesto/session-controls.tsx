"use client";

import { useId, useState, useTransition } from "react";
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

const OPTIONS: { value: Status; label: string }[] = [
  { value: "open", label: "A la venta" },
  { value: "closed", label: "Cerrar venta" },
  { value: "cancelled", label: "Cancelar" },
];

/** Estado (a la venta, cerrada, cancelada) y aforo de una salida, en el lateral del manifiesto. */
export function SessionControls({
  sessionId,
  status,
  capacity,
  booked,
  bookingCount,
}: {
  sessionId: string;
  status: Status;
  capacity: number;
  booked: number;
  bookingCount: number;
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
      <div role="group" aria-label="Estado de la salida" className="flex gap-0.5 rounded-[9px] bg-[#e8e8ed] p-[3px]">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={status === option.value}
            disabled={pending}
            onClick={() => {
              if (option.value === status) return;
              if (option.value === "cancelled" && bookingCount > 0) setConfirmCancel(true);
              else changeStatus(option.value);
            }}
            className={cn(
              "flex-1 rounded-md px-2 py-[7px] text-[0.8rem] font-medium text-muted-foreground disabled:opacity-60",
              "aria-pressed:bg-surface aria-pressed:text-foreground aria-pressed:shadow-[0_1px_2px_rgb(16_24_40/0.12)]",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

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
            className="w-28"
          />
          <Button type="submit" variant="outline" disabled={pending}>
            Guardar
          </Button>
        </div>
        <p id={`${id}-capacity-hint`} className="text-[0.75rem] text-faint">
          Solo cambia esta salida. El aforo general está en el producto.
        </p>
      </form>

      <Dialog open={confirmCancel} onOpenChange={(open) => !pending && setConfirmCancel(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Cancelar esta salida?</DialogTitle>
            <DialogDescription>
              Se cancelarán sus {bookingCount === 1 ? "reserva" : `${bookingCount} reservas`} ({booked}{" "}
              {booked === 1 ? "plaza" : "plazas"}). El reembolso de lo cobrado y el aviso por email a los clientes llegarán
              en una próxima versión.
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
