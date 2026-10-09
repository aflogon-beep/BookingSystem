import "server-only";

import { z } from "zod";

import type { NewBookingInitial, NewBookingProduct } from "@/components/reservas/types";
import { createClient } from "@/lib/db/server";
import { toBusinessDateTime } from "@/lib/domain/calendar";
import { productPhotoUrl } from "@/lib/domain/product";
import { businessToday } from "@/lib/domain/schedule";
import { getPublicEnv } from "@/lib/env";

/**
 * Productos a la venta con sus entradas y precios, y la salida de partida: la de `?salida=` si
 * existe (botón «Reservar» de una salida) o el primer producto en la fecha de `?fecha=` (hoy si no
 * viene o ya pasó).
 */
export async function loadNewBooking(search: Record<string, string | string[] | undefined>) {
  const supabase = await createClient();
  const [{ data: products, error }, { data: ticketTypes, error: ticketTypesError }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, color, photo_path, pickup, product_prices(ticket_type_id, price_cents)")
      .eq("active", true)
      .order("created_at")
      .order("name"),
    supabase.from("ticket_types").select("id, name, takes_seat").order("sort").order("created_at"),
  ]);
  if (error || ticketTypesError) throw new Error("No se pudieron cargar los productos.");

  const { supabaseUrl } = getPublicEnv();
  const catalog = products.map(
    (product): NewBookingProduct => ({
      id: product.id,
      name: product.name,
      color: product.color,
      photoUrl: product.photo_path ? productPhotoUrl(supabaseUrl, product.photo_path) : null,
      pickup: product.pickup,
      tickets: ticketTypes.flatMap((ticketType) => {
        const price = product.product_prices.find((candidate) => candidate.ticket_type_id === ticketType.id);
        return price
          ? [{ id: ticketType.id, name: ticketType.name, takesSeat: ticketType.takes_seat, priceCents: price.price_cents }]
          : [];
      }),
    }),
  );

  const today = businessToday();
  const rawDate = Array.isArray(search.fecha) ? search.fecha[0] : search.fecha;
  const date = rawDate && z.iso.date().safeParse(rawDate).success && rawDate > today ? rawDate : today;
  let initial: NewBookingInitial | null = catalog[0] ? { productId: catalog[0].id, date, sessionId: null } : null;
  const raw = Array.isArray(search.salida) ? search.salida[0] : search.salida;
  if (raw && z.uuid().safeParse(raw).success) {
    const { data: session } = await supabase.from("sessions").select("id, product_id, starts_at").eq("id", raw).maybeSingle();
    if (session && catalog.some((product) => product.id === session.product_id)) {
      initial = { productId: session.product_id, date: toBusinessDateTime(session.starts_at).date, sessionId: session.id };
    }
  }

  return { products: catalog, today, initial };
}
