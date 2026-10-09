import type { Metadata } from "next";
import Link from "next/link";

import { AddResourceButton, ResourceList } from "@/components/equipo/resource-list";
import { requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/db/server";
import { rangeForDays, visibleDays } from "@/lib/domain/calendar";
import { RESOURCE_TYPES, RESOURCE_TYPE_TEXT, countByResource, resourceTypeFromSlug, type ResourceType } from "@/lib/domain/resources";
import { businessToday } from "@/lib/domain/schedule";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Equipo" };

export default async function Page({ searchParams }: PageProps<"/panel/equipo">) {
  await requireAccess("equipo");
  const type = resourceTypeFromSlug((await searchParams).tipo);
  const week = rangeForDays(visibleDays("semana", businessToday()));

  const supabase = await createClient();
  const [{ data: resources, error }, { data: assignments, error: assignmentsError }, { data: settings }] = await Promise.all([
    supabase.from("resources").select("id, name, type, seats, languages").order("created_at").order("name"),
    supabase
      .from("session_resources")
      .select("resource_id, sessions!inner(starts_at)")
      .gte("sessions.starts_at", week.from)
      .lt("sessions.starts_at", week.to),
    supabase.from("settings").select("languages").eq("id", 1).single(),
  ]);
  if (error || assignmentsError || !settings) throw new Error("No se pudo cargar el equipo.");

  const weekly = countByResource(assignments);
  const countOf = (resourceType: ResourceType) => resources.filter((resource) => resource.type === resourceType).length;
  const rows = resources
    .filter((resource) => resource.type === type)
    .map((resource) => ({
      id: resource.id,
      name: resource.name,
      seats: resource.seats,
      languages: resource.languages,
      weeklySessions: weekly.get(resource.id) ?? 0,
    }));

  return (
    <section className="flex flex-col gap-4 tablet:gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[1.25rem] tablet:text-[1.45rem]">Equipo</h1>
          <p className="mt-[3px] text-[0.86rem] text-muted-foreground">
            Guías, vehículos y material. Se asignan a las salidas sin solaparse.
          </p>
        </div>
        <AddResourceButton type={type} />
      </div>
      <nav aria-label="Tipo de recurso" className="inline-flex flex-none gap-0.5 self-start rounded-[9px] bg-[#e8e8ed] p-[3px]">
        {RESOURCE_TYPES.map((option) => {
          const current = option === type;
          return (
            <Link
              key={option}
              href={`/panel/equipo?tipo=${RESOURCE_TYPE_TEXT[option].slug}`}
              aria-current={current ? "page" : undefined}
              className={cn(
                "rounded-md px-[11px] py-[5px] text-[0.8rem] font-medium max-tablet:py-2",
                current ? "bg-surface text-foreground shadow-[0_1px_2px_rgb(16_24_40/0.12)]" : "text-muted-foreground",
              )}
            >
              {RESOURCE_TYPE_TEXT[option].plural} <span className="font-mono text-[0.74rem] text-faint">{countOf(option)}</span>
            </Link>
          );
        })}
      </nav>
      <ResourceList key={type} type={type} rows={rows} languages={settings.languages} />
    </section>
  );
}
