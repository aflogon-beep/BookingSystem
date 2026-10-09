import "server-only";

import type { EditorTicketType } from "@/components/productos/product-editor";
import { createClient } from "@/lib/db/server";
import { RESOURCE_TYPES, type ResourceType } from "@/lib/domain/resources";
import { businessToday } from "@/lib/domain/schedule";

/**
 * Lo que el editor necesita además del producto: idiomas, moneda, tipos de entrada, cuántos
 * recursos hay de cada tipo y la fecha de hoy.
 */
export async function loadEditorContext() {
  const supabase = await createClient();
  const [{ data: settings }, { data: ticketTypes }, { count }, { data: resources }] = await Promise.all([
    supabase.from("settings").select("languages, currency, default_capacity").eq("id", 1).single(),
    supabase.from("ticket_types").select("id, name, note, takes_seat").order("sort").order("created_at"),
    supabase.from("products").select("id", { count: "exact", head: true }),
    supabase.from("resources").select("type"),
  ]);
  if (!settings || !ticketTypes || !resources) throw new Error("No se pudieron cargar los datos del editor.");

  const available = Object.fromEntries(
    RESOURCE_TYPES.map((type) => [type, resources.filter((resource) => resource.type === type).length]),
  ) as Record<ResourceType, number>;

  return {
    supabase,
    available,
    languages: settings.languages,
    currency: settings.currency,
    defaultCapacity: settings.default_capacity,
    productCount: count ?? 0,
    ticketTypes: ticketTypes.map(
      (ticketType): EditorTicketType => ({
        id: ticketType.id,
        name: ticketType.name,
        note: ticketType.note,
        takesSeat: ticketType.takes_seat,
      }),
    ),
    today: businessToday(),
  };
}
