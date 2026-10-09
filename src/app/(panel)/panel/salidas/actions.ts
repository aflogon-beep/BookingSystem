"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/db/server";

export type ManifestActionResult = { ok: true; message?: string } | { ok: false; error: string };

const uuid = z.uuid();

function fail(code: string | undefined, hint?: string): ManifestActionResult {
  switch (code) {
    case "RB001": {
      const occupied = Number(hint);
      return {
        ok: false,
        error: Number.isInteger(occupied)
          ? `Ya hay ${occupied} plazas ocupadas: el aforo no puede ser menor.`
          : "El aforo no puede ser menor que las plazas ocupadas.",
      };
    }
    case "RB004":
      return { ok: false, error: "Solo las reservas confirmadas hacen check-in." };
    case "RB005":
      return { ok: false, error: "Esta reserva ya no tiene un cobro pendiente." };
    case "P0002":
      return { ok: false, error: "No se ha encontrado. Recarga la página." };
    case "42501":
      return { ok: false, error: "No tienes permiso para hacer esto." };
    default:
      return { ok: false, error: "No se pudo guardar. Inténtalo de nuevo." };
  }
}

function done(message?: string): ManifestActionResult {
  revalidatePath("/panel", "layout");
  return { ok: true, message };
}

export async function setCheckedIn(bookingId: string, checked: boolean): Promise<ManifestActionResult> {
  await requireAccess("hoy");
  if (!uuid.safeParse(bookingId).success || typeof checked !== "boolean") return fail(undefined);
  const supabase = await createClient();
  const { error } = await supabase.rpc("booking_set_checked_in", { p_booking_id: bookingId, p_checked: checked });
  return error ? fail(error.code) : done();
}

export async function checkInAll(sessionId: string): Promise<ManifestActionResult> {
  await requireAccess("hoy");
  if (!uuid.safeParse(sessionId).success) return fail(undefined);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("session_check_in_all", { p_session_id: sessionId });
  if (error) return fail(error.code);
  return done(data ? "Todos los pasajeros presentados" : "Ya estaban todos presentados");
}

const methodSchema = z.enum(["cash", "card_terminal"]);

export async function collectPayment(bookingId: string, method: string): Promise<ManifestActionResult> {
  await requireAccess("hoy");
  const parsedMethod = methodSchema.safeParse(method);
  if (!uuid.safeParse(bookingId).success || !parsedMethod.success) return fail(undefined);
  const supabase = await createClient();
  const { error } = await supabase.rpc("booking_collect_payment", { p_booking_id: bookingId, p_method: parsedMethod.data });
  return error ? fail(error.code) : done();
}

const statusSchema = z.enum(["open", "closed", "cancelled"]);

const STATUS_MESSAGES = {
  open: "Salida a la venta",
  closed: "Venta cerrada para esta salida",
  cancelled: "Salida cancelada",
} as const;

export async function setSessionStatus(sessionId: string, status: string): Promise<ManifestActionResult> {
  await requireAccess("hoy");
  const parsed = statusSchema.safeParse(status);
  if (!uuid.safeParse(sessionId).success || !parsed.success) return fail(undefined);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("session_set_status", { p_session_id: sessionId, p_status: parsed.data });
  if (error) return fail(error.code);
  const cancelled = data ? ` y ${data === 1 ? "1 reserva cancelada" : `${data} reservas canceladas`}` : "";
  return done(STATUS_MESSAGES[parsed.data] + cancelled);
}

const capacitySchema = z.int().min(1).max(500);

/** Aforo solo de esta salida: deja de seguir al del producto (capacity_custom). */
export async function setSessionCapacity(sessionId: string, capacity: number): Promise<ManifestActionResult> {
  await requireAccess("hoy");
  const parsed = capacitySchema.safeParse(capacity);
  if (!uuid.safeParse(sessionId).success) return fail(undefined);
  if (!parsed.success) return { ok: false, error: "El aforo debe estar entre 1 y 500 plazas." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sessions")
    .update({ capacity: parsed.data, capacity_custom: true })
    .eq("id", sessionId)
    .select("id");
  if (error) return fail(error.code, error.hint);
  if (!data.length) return fail("P0002");
  return done(`Aforo de esta salida: ${parsed.data}`);
}
