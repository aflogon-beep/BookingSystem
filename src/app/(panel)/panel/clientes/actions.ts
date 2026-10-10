"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/db/server";

export type CustomerActionResult = { ok: true } | { ok: false; error: string };

/**
 * Borra los datos personales de un cliente (RGPD, a petición suya): nombre, email, teléfono y el
 * hotel y las notas de sus reservas. Las reservas se quedan. Solo admin (la función lo vuelve a
 * comprobar).
 */
export async function anonymizeCustomer(customerId: string): Promise<CustomerActionResult> {
  const staff = await requireAccess("clientes");
  if (staff.role !== "admin") return { ok: false, error: "Solo un admin puede borrar los datos de un cliente." };
  if (!z.uuid().safeParse(customerId).success) return { ok: false, error: "Datos no válidos." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("anonymize_customer", { p_customer_id: customerId });
  if (error) {
    if (error.code === "RB010") {
      return { ok: false, error: "Tiene reservas próximas. Cancélalas antes de borrar sus datos." };
    }
    return { ok: false, error: "No se pudieron borrar los datos. Inténtalo de nuevo." };
  }
  revalidatePath("/panel", "layout");
  return { ok: true };
}
