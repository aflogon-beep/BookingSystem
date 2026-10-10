import type { Metadata } from "next";

import { SetupWizard } from "@/components/asistente/setup-wizard";
import { requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/db/server";
import { businessToday } from "@/lib/domain/schedule";
import { nextTicketTypeSort } from "@/lib/domain/settings";
import { newSetupDraft, ticketOptions } from "@/lib/domain/setup";

export const metadata: Metadata = { title: "Asistente de configuración" };

/** Asistente de configuración inicial. Solo admin: toca ajustes y tipos de entrada. */
export default async function Page() {
  await requireAccess("ajustes");
  const supabase = await createClient();
  const [settings, ticketTypes, rules, guides] = await Promise.all([
    supabase.from("settings").select("business_name, currency, languages").eq("id", 1).single(),
    supabase.from("ticket_types").select("id, name, note, takes_seat, sort").order("sort").order("created_at"),
    supabase.from("schedule_rules").select("language"),
    supabase.from("resources").select("id").eq("type", "guide").limit(1),
  ]);
  if (settings.error || ticketTypes.error || rules.error || guides.error) throw new Error("No se pudo cargar el asistente.");

  const tickets = ticketOptions(
    ticketTypes.data.map((ticketType) => ({ id: ticketType.id, name: ticketType.name, note: ticketType.note, takesSeat: ticketType.takes_seat })),
  );
  const draft = newSetupDraft(
    { businessName: settings.data.business_name, currency: settings.data.currency, languages: settings.data.languages },
    tickets,
  );

  return (
    <SetupWizard
      initialDraft={draft}
      today={businessToday()}
      context={{
        usedLanguages: [...new Set(rules.data.map((rule) => rule.language))],
        hasGuides: guides.data.length > 0,
        nextTicketSort: nextTicketTypeSort(ticketTypes.data),
      }}
    />
  );
}
