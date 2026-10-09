import type { Metadata } from "next";

import { TicketTypesEditor } from "@/components/ajustes/ticket-types-editor";
import { requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/db/server";

export const metadata: Metadata = { title: "Tipos de entrada · Ajustes" };

export default async function Page() {
  await requireAccess("ajustes");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ticket_types")
    .select("id, name, note, name_en, note_en, takes_seat, product_prices(count)")
    .order("sort")
    .order("created_at");
  if (error) throw new Error("No se pudieron cargar los tipos de entrada.");

  const rows = data.map((ticketType) => ({
    id: ticketType.id,
    name: ticketType.name,
    note: ticketType.note,
    nameEn: ticketType.name_en,
    noteEn: ticketType.note_en,
    takesSeat: ticketType.takes_seat,
    productCount: ticketType.product_prices[0]?.count ?? 0,
  }));

  return <TicketTypesEditor rows={rows} />;
}
