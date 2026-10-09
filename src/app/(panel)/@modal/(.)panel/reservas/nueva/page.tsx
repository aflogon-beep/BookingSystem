import { NewBookingDialog } from "@/components/reservas/new-booking-dialog";
import { loadNewBooking } from "@/app/(panel)/panel/reservas/nueva/data";
import { requireAccess } from "@/lib/auth";

// «Nueva reserva» abierta desde el panel: se muestra en modal encima de la pantalla actual.
// Si se entra directamente en la URL (o se recarga), se ve la página completa.
export default async function Page({ searchParams }: PageProps<"/panel/reservas/nueva">) {
  await requireAccess("reservas");
  const data = await loadNewBooking(await searchParams);
  return <NewBookingDialog {...data} />;
}
