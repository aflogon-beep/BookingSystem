"use server";

import { revalidatePath } from "next/cache";

import { requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/db/server";
import { slugify, uniqueSlug } from "@/lib/domain/product";
import { generationWindow } from "@/lib/domain/schedule";
import { nextTicketTypeSort } from "@/lib/domain/settings";
import { parseSetupInput, type SetupStep } from "@/lib/domain/setup";

export type CompleteSetupResult = { ok: true } | { ok: false; error: string; step: SetupStep };

const SAVE_FAILED = "No se pudo guardar. Inténtalo de nuevo.";

/**
 * Guarda el asistente: negocio, entradas, equipo y primer tour en una sola transacción
 * (complete_setup) y genera las salidas del tour. Todo se valida aquí con lo que hay en la BD.
 */
export async function completeSetup(input: unknown): Promise<CompleteSetupResult> {
  await requireAccess("ajustes");
  const supabase = await createClient();

  const [ticketTypes, rules, guides] = await Promise.all([
    supabase.from("ticket_types").select("id, sort"),
    supabase.from("schedule_rules").select("language"),
    supabase.from("resources").select("id").eq("type", "guide").limit(1),
  ]);
  if (ticketTypes.error || rules.error || guides.error) return { ok: false, error: SAVE_FAILED, step: 5 };

  const parsed = parseSetupInput(input, {
    existingTicketIds: ticketTypes.data.map((ticketType) => ticketType.id),
    usedLanguages: [...new Set(rules.data.map((rule) => rule.language))],
    hasGuides: guides.data.length > 0,
    nextTicketSort: nextTicketTypeSort(ticketTypes.data),
  });
  if (!parsed.ok) return parsed;
  const payload = parsed.value;

  const base = slugify(payload.product.name);
  const { data: taken } = await supabase.from("products").select("slug").like("slug", `${base}%`);
  if (!taken) return { ok: false, error: SAVE_FAILED, step: 5 };
  const slug = uniqueSlug(base, new Set(taken.map((row) => row.slug)));

  const { data: productId, error } = await supabase.rpc("complete_setup", {
    p: { ...payload, product: { ...payload.product, slug } },
  });
  if (error || typeof productId !== "string") {
    console.error("complete_setup falló", error?.code, error?.message);
    return { ok: false, error: SAVE_FAILED, step: 5 };
  }

  // Si falla, el job diario genera las salidas igualmente: no se avisa como error.
  const { from, to } = generationWindow();
  const generated = await supabase.rpc("generate_sessions", { p_from: from, p_to: to, p_product_id: productId });
  if (generated.error) console.error("generate_sessions falló", generated.error.code, generated.error.message);

  revalidatePath("/", "layout");
  return { ok: true };
}
