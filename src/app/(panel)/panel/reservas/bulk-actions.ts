"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/db/server";
import { BULK_LIMIT } from "@/lib/domain/booking-bulk";

export type BulkResult = { ok: true; done: number; failed: number } | { ok: false; error: string };

const idsSchema = z.array(z.uuid()).min(1).max(BULK_LIMIT);
const methodSchema = z.enum(["cash", "card_terminal"]);

/**
 * Las acciones en bloque son las mismas funciones SQL que reserva a reserva (cada una comprueba su
 * estado y permisos), una tras otra; al final se refresca el panel una sola vez.
 */
async function forEachBooking(ids: unknown, run: (supabase: Awaited<ReturnType<typeof createClient>>, id: string) => PromiseLike<{ error: unknown }>) {
  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success) return { ok: false, error: "Selección no válida. Recarga la página." } satisfies BulkResult;
  const supabase = await createClient();
  let done = 0;
  for (const id of new Set(parsed.data)) {
    const { error } = await run(supabase, id);
    if (!error) done += 1;
  }
  if (done) revalidatePath("/panel", "layout");
  return { ok: true, done, failed: new Set(parsed.data).size - done } satisfies BulkResult;
}

/** Check-in de varias reservas a la vez (el grupo entero de cada una). */
export async function checkInBookings(ids: string[]): Promise<BulkResult> {
  await requireAccess("hoy");
  return forEachBooking(ids, (supabase, id) => supabase.rpc("booking_set_checked_in", { p_booking_id: id, p_checked: true }));
}

/** Cobra varias reservas pendientes con el mismo medio (efectivo o TPV). */
export async function collectBookings(ids: string[], method: string): Promise<BulkResult> {
  await requireAccess("hoy");
  const parsed = methodSchema.safeParse(method);
  if (!parsed.success) return { ok: false, error: "Elige efectivo o tarjeta." };
  return forEachBooking(ids, (supabase, id) => supabase.rpc("booking_collect_payment", { p_booking_id: id, p_method: parsed.data }));
}
