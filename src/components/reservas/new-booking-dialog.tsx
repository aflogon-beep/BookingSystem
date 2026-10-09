"use client";

import { useRouter } from "next/navigation";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { NewBookingForm } from "./new-booking-form";
import type { NewBookingInitial, NewBookingProduct } from "./types";

/** Modal de «Nueva reserva»: al cerrarlo vuelve a la pantalla desde la que se abrió. */
export function NewBookingDialog(props: {
  products: NewBookingProduct[];
  today: string;
  initial: NewBookingInitial | null;
}) {
  const router = useRouter();
  return (
    <Dialog open onOpenChange={(open) => !open && router.back()}>
      <DialogContent className="tablet:h-[min(760px,calc(100dvh-32px))] tablet:max-w-[920px]">
        <DialogHeader className="border-b border-line pb-4">
          <span className="text-[0.72rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Reserva interna</span>
          <DialogTitle className="text-[1.3rem]">Nueva reserva</DialogTitle>
          <DialogDescription className="sr-only">Teléfono, mostrador o agencia.</DialogDescription>
        </DialogHeader>
        <NewBookingForm {...props} mode="modal" />
      </DialogContent>
    </Dialog>
  );
}
