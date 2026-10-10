"use client";

import { useState, useTransition } from "react";
import { UserX } from "lucide-react";
import { toast } from "sonner";

import { anonymizeCustomer } from "@/app/(panel)/panel/clientes/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** «Borrar datos personales» (RGPD): confirma antes, porque no se puede deshacer. */
export function AnonymizeCustomerButton({ customerId, name }: { customerId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-danger">
          <UserX aria-hidden="true" />
          Borrar datos personales
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Borrar datos de {name}</DialogTitle>
          <DialogDescription>
            Se borran el nombre, el email, el teléfono y el hotel y las notas de sus reservas. Las reservas se quedan, sin datos
            del cliente, para que cuadren las plazas y los informes. No se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        <div className="pb-4" />
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
                const result = await anonymizeCustomer(customerId);
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                toast.success("Datos del cliente borrados");
                setOpen(false);
              })
            }
          >
            Borrar datos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
