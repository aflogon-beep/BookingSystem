import "server-only";

import type { EditorTicketType } from "@/components/productos/product-editor";
import { createClient } from "@/lib/db/server";
import { businessToday } from "@/lib/domain/schedule";

/** Lo que el editor necesita además del producto: idiomas, moneda, tipos de entrada y la fecha de hoy. */
export async function loadEditorContext() {
  const supabase = await createClient();
  const [{ data: settings }, { data: ticketTypes }, { count }] = await Promise.all([
    supabase.from("settings").select("languages, currency, default_capacity").eq("id", 1).single(),
    supabase.from("ticket_types").select("id, name, note, takes_seat").order("sort").order("created_at"),
    supabase.from("products").select("id", { count: "exact", head: true }),
  ]);
  if (!settings || !ticketTypes) throw new Error("No se pudieron cargar los datos del editor.");

  return {
    supabase,
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
