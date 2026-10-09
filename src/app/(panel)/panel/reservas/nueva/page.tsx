import type { Metadata } from "next";

import { NewBookingForm } from "@/components/reservas/new-booking-form";
import { requireAccess } from "@/lib/auth";

import { loadNewBooking } from "./data";

export const metadata: Metadata = { title: "Nueva reserva" };

export default async function Page({ searchParams }: PageProps<"/panel/reservas/nueva">) {
  await requireAccess("reservas");
  const data = await loadNewBooking(await searchParams);

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-4">
      <div>
        <p className="text-[0.72rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Reserva interna</p>
        <h1 className="text-[1.25rem] tablet:text-[1.45rem]">Nueva reserva</h1>
      </div>
      <div className="flex flex-col overflow-hidden rounded-[20px] border border-line bg-surface shadow-[0_1px_2px_rgb(10_20_32/0.04)]">
        <NewBookingForm {...data} mode="page" />
      </div>
    </div>
  );
}
