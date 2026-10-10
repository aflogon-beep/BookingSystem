import type { Metadata } from "next";

import { AttentionList } from "@/components/hoy/attention-list";
import { requireStaff } from "@/lib/auth";
import { businessToday } from "@/lib/domain/schedule";
import { attentionItems } from "@/lib/domain/today";

import { loadSoonSessions } from "../today-data";

export const metadata: Metadata = { title: "Avisos" };

/** Avisos de la campana: salidas de las próximas 48 h sin equipo o por debajo del mínimo. */
export default async function Page() {
  await requireStaff();
  const now = new Date();
  const today = businessToday(now);
  const items = attentionItems(await loadSoonSessions(today, now), now);

  return (
    <section className="flex max-w-[720px] flex-col gap-4 tablet:gap-5">
      <div>
        <h1 className="text-[1.25rem] tablet:text-[1.45rem]">Avisos</h1>
        <p className="mt-[3px] text-[0.86rem] text-muted-foreground">
          Salidas de las próximas 48 horas sin equipo asignado o por debajo del mínimo de pasajeros.
        </p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-black/5 bg-surface shadow-card">
        <AttentionList items={items} today={today} emptyTitle="Sin avisos" />
      </div>
    </section>
  );
}
