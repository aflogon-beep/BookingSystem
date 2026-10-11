import "server-only";

import { cookies } from "next/headers";

import { createAdminClient } from "@/lib/db/admin";
import { hasRecentBooking, RECENT_BOOKINGS_COOKIE } from "@/lib/domain/web-checkout";

const CODE = /^VT[0-9A-Z]{6}$/;

/**
 * Reserva web por su código, solo para el navegador que la hizo (cookie httpOnly con sus últimas
 * reservas). Con el código solo, o si no existe, null: quien llama responde 404.
 */
export async function loadOwnWebBooking(code: string) {
  if (!CODE.test(code)) return null;
  const { data: booking, error } = await createAdminClient()
    .from("bookings")
    .select(
      "id, code, status, payment_status, total_cents, hotel, sessions(starts_at, ends_at, language, products(name, meeting_point, name_en, meeting_point_en, pickup)), booking_lines(qty, ticket_types(name, name_en, sort))",
    )
    .eq("code", code)
    .eq("channel", "web")
    .maybeSingle();
  if (error) throw new Error("No se pudo cargar la reserva.");
  const jar = await cookies();
  if (!booking || !hasRecentBooking(jar.get(RECENT_BOOKINGS_COOKIE)?.value, booking.id)) return null;
  const session = booking.sessions;
  const product = session?.products;
  if (!session || !product) return null;
  return { booking, session, product };
}
