"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/db/server";
import {
  PRODUCT_PHOTO_BUCKET,
  parseProductInput,
  slugify,
  uniqueSlug,
  type ProductData,
  type ProductTab,
} from "@/lib/domain/product";

export type ActionResult = { ok: true } | { ok: false; error: string };
export type SaveProductResult = { ok: true; id: string } | { ok: false; error: string; tab: ProductTab };

const SAVE_FAILED = "No se pudo guardar. Inténtalo de nuevo.";
const idSchema = z.uuid();

type Supabase = Awaited<ReturnType<typeof createClient>>;

function refresh() {
  revalidatePath("/panel/productos", "layout");
}

/** Borra una foto que ya no usa ningún producto. Si falla, solo queda un archivo huérfano. */
async function removePhoto(supabase: Supabase, path: string | null) {
  if (path) await supabase.storage.from(PRODUCT_PHOTO_BUCKET).remove([path]);
}

function rpcArgs(product: ProductData) {
  return {
    p_product: {
      name: product.name,
      description: product.description,
      meeting_point: product.meetingPoint,
      place: product.place,
      duration_min: product.durationMin,
      capacity: product.capacity,
      min_pax: product.minPax,
      pickup: product.pickup,
      color: product.color,
      photo_path: product.photoPath,
      active: product.active,
    },
    p_prices: product.prices.map((price) => ({ ticket_type_id: price.ticketTypeId, price_cents: price.priceCents })),
    p_rules: product.rules.map((rule) => ({
      weekdays: rule.weekdays,
      times: rule.times,
      language: rule.language,
      valid_from: rule.validFrom,
      valid_to: rule.validTo,
    })),
  };
}

async function freeSlug(supabase: Supabase, name: string): Promise<string | null> {
  const base = slugify(name);
  const { data } = await supabase.from("products").select("slug").like("slug", `${base}%`);
  if (!data) return null;
  return uniqueSlug(base, new Set(data.map((row) => row.slug)));
}

/**
 * Crea (id null) o actualiza un producto con sus precios y horarios. Todo se valida aquí:
 * idiomas y tipos de entrada salen de la BD, nunca del cliente. El guardado es una sola
 * transacción (save_product).
 */
export async function saveProduct(id: string | null, input: unknown): Promise<SaveProductResult> {
  await requireAccess("productos");
  if (id !== null && !idSchema.safeParse(id).success) return { ok: false, error: "Producto no válido.", tab: "general" };

  const supabase = await createClient();
  const [{ data: settings }, { data: ticketTypes }] = await Promise.all([
    supabase.from("settings").select("languages").eq("id", 1).single(),
    supabase.from("ticket_types").select("id"),
  ]);
  if (!settings || !ticketTypes) return { ok: false, error: SAVE_FAILED, tab: "general" };

  const parsed = parseProductInput(input, {
    languages: settings.languages,
    ticketTypeIds: ticketTypes.map((ticketType) => ticketType.id),
  });
  if (!parsed.ok) return parsed;
  const product = parsed.value;
  const args = rpcArgs(product);

  if (id !== null) {
    const { data: current } = await supabase.from("products").select("photo_path").eq("id", id).maybeSingle();
    if (!current) return { ok: false, error: "Este producto ya no existe.", tab: "general" };

    const { error } = await supabase.rpc("save_product", { ...args, p_id: id });
    if (error) return { ok: false, error: SAVE_FAILED, tab: "general" };
    if (current.photo_path !== product.photoPath) await removePhoto(supabase, current.photo_path);
    refresh();
    return { ok: true, id };
  }

  // Si otro guardado coge el mismo slug a la vez, unique(slug) falla (23505) y se reintenta.
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = await freeSlug(supabase, product.name);
    if (!slug) break;
    const { data, error } = await supabase.rpc("save_product", { ...args, p_product: { ...args.p_product, slug } });
    if (!error) {
      refresh();
      return { ok: true, id: data };
    }
    if (error.code !== "23505") break;
  }
  return { ok: false, error: SAVE_FAILED, tab: "general" };
}

/** Pone o quita un producto a la venta (interruptor «A la venta» de la lista). */
export async function setProductActive(id: string, active: boolean): Promise<ActionResult> {
  await requireAccess("productos");
  if (!idSchema.safeParse(id).success || typeof active !== "boolean") return { ok: false, error: "Datos no válidos." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("products").update({ active }).eq("id", id).select("id");
  if (error || data.length !== 1) return { ok: false, error: SAVE_FAILED };
  refresh();
  return { ok: true };
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  await requireAccess("productos");
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Producto no válido." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("products").delete().eq("id", id).select("photo_path");
  if (error || data.length !== 1) return { ok: false, error: "No se pudo eliminar. Inténtalo de nuevo." };
  await removePhoto(supabase, data[0]?.photo_path ?? null);
  refresh();
  return { ok: true };
}
