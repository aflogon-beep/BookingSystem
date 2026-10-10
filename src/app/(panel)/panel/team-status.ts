import "server-only";

import type { createClient } from "@/lib/db/server";
import { isResourceType, type ResourceType } from "@/lib/domain/resources";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// PostgREST corta cada respuesta en max_rows (1000).
const PAGE_SIZE = 1000;

/**
 * Salidas que no admiten reservas porque un recurso obligatorio está en otra salida a esa hora
 * (vista session_team_status, la misma regla que create_booking_hold), con el tipo que falta.
 */
export async function loadBlockedNeeds(
  supabase: Supabase,
  range: { from: string; to: string },
  productId: string | null = null,
): Promise<Map<string, ResourceType>> {
  const blocked = new Map<string, ResourceType>();
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = supabase
      .from("session_team_status")
      .select("session_id, blocking_need")
      .gte("starts_at", range.from)
      .lt("starts_at", range.to)
      .eq("team_free", false)
      .order("starts_at")
      .order("session_id")
      .range(offset, offset + PAGE_SIZE - 1);
    if (productId) query = query.eq("product_id", productId);
    const { data, error } = await query;
    if (error) throw new Error("No se pudieron cargar las salidas.");
    for (const row of data) if (row.session_id && isResourceType(row.blocking_need)) blocked.set(row.session_id, row.blocking_need);
    if (data.length < PAGE_SIZE) return blocked;
  }
}

/** Recurso obligatorio que impide reservar una salida, o null. */
export async function loadBlockedNeed(supabase: Supabase, sessionId: string): Promise<ResourceType | null> {
  const { data, error } = await supabase.from("session_team_status").select("blocking_need").eq("session_id", sessionId).maybeSingle();
  if (error) throw new Error("No se pudo cargar la salida.");
  return isResourceType(data?.blocking_need) ? data.blocking_need : null;
}
