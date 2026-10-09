"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAccess } from "@/lib/auth";
import type { TablesUpdate } from "@/lib/database.types";
import { createClient } from "@/lib/db/server";
import {
  isLanguageCode,
  isSettingsField,
  isTicketTypeField,
  nextTicketTypeSort,
  parseSettingsField,
  parseTicketTypeField,
  toggleLanguage,
} from "@/lib/domain/settings";

export type ActionResult = { ok: true } | { ok: false; error: string };

const SAVE_FAILED = "No se pudo guardar. Inténtalo de nuevo.";
const idSchema = z.uuid();

function refresh() {
  revalidatePath("/panel/ajustes", "layout");
}

/** Guarda un campo de la fila de ajustes. Solo admin (RLS lo vuelve a comprobar). */
export async function saveSetting(field: string, raw: unknown): Promise<ActionResult> {
  await requireAccess("ajustes");
  if (!isSettingsField(field)) return { ok: false, error: "Campo desconocido." };
  const parsed = parseSettingsField(field, raw);
  if (!parsed.ok) return parsed;

  const supabase = await createClient();
  // El esquema de cada campo valida el tipo de su columna: el cast solo pierde la relación clave-valor.
  const patch = { [field]: parsed.value } as TablesUpdate<"settings">;
  const { data, error } = await supabase.from("settings").update(patch).eq("id", 1).select("id");
  if (error || data.length !== 1) return { ok: false, error: SAVE_FAILED };
  refresh();
  return { ok: true };
}

export async function toggleBusinessLanguage(language: string): Promise<ActionResult> {
  await requireAccess("ajustes");
  if (!isLanguageCode(language)) return { ok: false, error: "Idioma no admitido." };

  const supabase = await createClient();
  const [{ data: settings }, { data: rules }] = await Promise.all([
    supabase.from("settings").select("languages").eq("id", 1).single(),
    supabase.from("schedule_rules").select("language"),
  ]);
  if (!settings || !rules) return { ok: false, error: SAVE_FAILED };

  const next = toggleLanguage(settings.languages, language, rules.map((rule) => rule.language));
  if (!next.ok) return next;

  const { data, error } = await supabase.from("settings").update({ languages: next.value }).eq("id", 1).select("id");
  if (error || data.length !== 1) return { ok: false, error: SAVE_FAILED };
  refresh();
  return { ok: true };
}

export async function addTicketType(): Promise<ActionResult> {
  await requireAccess("ajustes");
  const supabase = await createClient();
  const { data: existing } = await supabase.from("ticket_types").select("sort");
  if (!existing) return { ok: false, error: SAVE_FAILED };

  const { error } = await supabase
    .from("ticket_types")
    .insert({ name: "Nuevo tipo", note: "", takes_seat: true, sort: nextTicketTypeSort(existing) });
  if (error) return { ok: false, error: SAVE_FAILED };
  refresh();
  return { ok: true };
}

export async function saveTicketType(id: string, field: string, raw: unknown): Promise<ActionResult> {
  await requireAccess("ajustes");
  if (!idSchema.safeParse(id).success || !isTicketTypeField(field)) return { ok: false, error: "Datos no válidos." };
  const parsed = parseTicketTypeField(field, raw);
  if (!parsed.ok) return parsed;

  const supabase = await createClient();
  const patch = { [field]: parsed.value } as TablesUpdate<"ticket_types">;
  const { data, error } = await supabase.from("ticket_types").update(patch).eq("id", id).select("id");
  if (error || data.length !== 1) return { ok: false, error: SAVE_FAILED };
  refresh();
  return { ok: true };
}

/** Borra un tipo de entrada. Sus precios se borran en cascada: deja de venderse en todos los productos. */
export async function deleteTicketType(id: string): Promise<ActionResult> {
  await requireAccess("ajustes");
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Datos no válidos." };

  const supabase = await createClient();
  const { count } = await supabase.from("ticket_types").select("id", { count: "exact", head: true });
  if (count !== null && count <= 1) return { ok: false, error: "Tiene que quedar al menos un tipo de entrada." };

  const { data, error } = await supabase.from("ticket_types").delete().eq("id", id).select("id");
  if (error) {
    // 23503: lo referencia algo con «restrict» (reservas, a partir de la tarea 1.6).
    return { ok: false, error: error.code === "23503" ? "Hay reservas con este tipo de entrada." : SAVE_FAILED };
  }
  if (data.length !== 1) return { ok: false, error: SAVE_FAILED };
  refresh();
  return { ok: true };
}
