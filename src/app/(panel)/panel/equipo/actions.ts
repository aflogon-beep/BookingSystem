"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAccess } from "@/lib/auth";
import type { TablesUpdate } from "@/lib/database.types";
import { createClient } from "@/lib/db/server";
import {
  DEFAULT_SEATS,
  RESOURCE_TYPE_TEXT,
  isResourceField,
  isResourceType,
  parseResourceField,
  toggleGuideLanguage,
} from "@/lib/domain/resources";
import { isLanguageCode } from "@/lib/domain/settings";

export type ActionResult = { ok: true } | { ok: false; error: string };

const SAVE_FAILED = "No se pudo guardar. Inténtalo de nuevo.";
const idSchema = z.uuid();

function refresh() {
  revalidatePath("/panel/equipo");
}

/**
 * Añade un recurso con el nombre de uno nuevo del prototipo («Nuevo guía»…), para renombrarlo en la
 * ficha. Un guía nuevo guía en el primer idioma de Ajustes.
 */
export async function addResource(type: string): Promise<ActionResult> {
  await requireAccess("equipo");
  if (!isResourceType(type)) return { ok: false, error: "Tipo no válido." };

  const supabase = await createClient();
  let languages: string[] = [];
  if (type === "guide") {
    const { data: settings } = await supabase.from("settings").select("languages").eq("id", 1).single();
    if (!settings) return { ok: false, error: SAVE_FAILED };
    languages = settings.languages.slice(0, 1);
  }
  const { error } = await supabase
    .from("resources")
    .insert({ name: RESOURCE_TYPE_TEXT[type].newName, type, seats: DEFAULT_SEATS[type], languages });
  if (error) return { ok: false, error: SAVE_FAILED };
  refresh();
  return { ok: true };
}

/** Guarda el nombre o los asientos/unidades de un recurso. Los guías tienen siempre 1. */
export async function saveResource(id: string, field: string, raw: unknown): Promise<ActionResult> {
  await requireAccess("equipo");
  if (!idSchema.safeParse(id).success || !isResourceField(field)) return { ok: false, error: "Datos no válidos." };
  const parsed = parseResourceField(field, raw);
  if (!parsed.ok) return parsed;

  const supabase = await createClient();
  const patch = { [field]: parsed.value } as TablesUpdate<"resources">;
  let query = supabase.from("resources").update(patch).eq("id", id);
  if (field === "seats") query = query.neq("type", "guide");
  const { data, error } = await query.select("id");
  if (error || data.length !== 1) return { ok: false, error: SAVE_FAILED };
  refresh();
  return { ok: true };
}

/**
 * Activa o desactiva un idioma de un guía. Solo se activan idiomas de Ajustes; uno que ya no esté
 * en Ajustes se puede quitar.
 */
export async function toggleResourceLanguage(id: string, language: string): Promise<ActionResult> {
  await requireAccess("equipo");
  if (!idSchema.safeParse(id).success || !isLanguageCode(language)) return { ok: false, error: "Datos no válidos." };

  const supabase = await createClient();
  const [{ data: resource }, { data: settings }] = await Promise.all([
    supabase.from("resources").select("languages").eq("id", id).eq("type", "guide").maybeSingle(),
    supabase.from("settings").select("languages").eq("id", 1).single(),
  ]);
  if (!resource || !settings) return { ok: false, error: SAVE_FAILED };
  if (!resource.languages.includes(language) && !settings.languages.includes(language)) {
    return { ok: false, error: "Ese idioma no está en Ajustes." };
  }

  const { data, error } = await supabase
    .from("resources")
    .update({ languages: toggleGuideLanguage(resource.languages, language) })
    .eq("id", id)
    .select("id");
  if (error || data.length !== 1) return { ok: false, error: SAVE_FAILED };
  refresh();
  return { ok: true };
}

/** Borra un recurso. Sus asignaciones a salidas se borran en cascada. */
export async function deleteResource(id: string): Promise<ActionResult> {
  await requireAccess("equipo");
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Datos no válidos." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("resources").delete().eq("id", id).select("id");
  if (error || data.length !== 1) return { ok: false, error: "No se pudo eliminar. Inténtalo de nuevo." };
  refresh();
  return { ok: true };
}
