import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, ChevronLeft, ChevronRight, MapPin } from "lucide-react";

import { AssignPendingButton } from "@/components/equipo/assign-pending-button";
import { AddResourceButton, ResourceList } from "@/components/equipo/resource-list";
import { WeeklyPlan } from "@/components/equipo/weekly-plan";
import { Whereabouts } from "@/components/equipo/whereabouts";
import { Button } from "@/components/ui/button";
import { requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/db/server";
import { longDayLabel, toBusinessDateTime, visibleDays } from "@/lib/domain/calendar";
import { RESOURCE_TYPES, RESOURCE_TYPE_TEXT, countByResource, resourceTypeFromSlug, type ResourceType } from "@/lib/domain/resources";
import { businessToday } from "@/lib/domain/schedule";
import { parseDayParam, shiftDay } from "@/lib/domain/today";
import { cn } from "@/lib/utils";

import { loadDaySessions, loadResources, loadWeekSessions } from "./data";

export const metadata: Metadata = { title: "Equipo" };

const segmentClass = (current: boolean) =>
  cn(
    "inline-flex items-center gap-1.5 rounded-md px-[11px] py-[5px] text-[0.8rem] font-medium max-tablet:py-2 [&_svg]:size-4",
    current ? "bg-surface text-foreground shadow-[0_1px_2px_rgb(16_24_40/0.12)]" : "text-muted-foreground",
  );

const dayHref = (day: string, today: string) => (day === today ? "/panel/equipo" : `/panel/equipo?fecha=${day}`);

export default async function Page({ searchParams }: PageProps<"/panel/equipo">) {
  await requireAccess("equipo");
  const params = await searchParams;
  // Por defecto «Dónde están», como el prototipo; ?tipo= (pestañas de fichas) abre las fichas.
  const view = params.vista === "fichas" || params.tipo !== undefined ? "fichas" : "donde";
  const now = new Date();
  const today = businessToday(now);
  const resources = await loadResources();

  if (view === "donde") {
    const day = parseDayParam(params.fecha, today);
    const isToday = day === today;
    const sessions = await loadDaySessions(day, resources);
    return (
      <section className="flex flex-col gap-4 tablet:gap-5">
        <Header
          subtitle={
            isToday
              ? `Dónde está cada guía, vehículo y equipo ahora mismo · ${toBusinessDateTime(now.toISOString()).time}`
              : "Asignaciones del día"
          }
          action={day >= today ? <AssignPendingButton day={day} /> : null}
        />
        <ViewNav view={view} />
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            <Button asChild variant="outline" size="icon-sm">
              <Link href={dayHref(shiftDay(day, -1), today)} aria-label="Día anterior">
                <ChevronLeft aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/panel/equipo">Hoy</Link>
            </Button>
            <Button asChild variant="outline" size="icon-sm">
              <Link href={dayHref(shiftDay(day, 1), today)} aria-label="Día siguiente">
                <ChevronRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
          <h2 className="text-[1.15rem] first-letter:uppercase">{longDayLabel(day)}</h2>
        </div>
        <Whereabouts day={day} isToday={isToday} now={now} resources={resources} sessions={sessions} />
      </section>
    );
  }

  const type = resourceTypeFromSlug(params.tipo);
  const week = visibleDays("semana", today);
  const supabase = await createClient();
  const [weekSessions, { data: settings }] = await Promise.all([
    loadWeekSessions(week),
    supabase.from("settings").select("languages").eq("id", 1).single(),
  ]);
  if (!settings) throw new Error("No se pudo cargar el equipo.");

  const weekly = countByResource(weekSessions.flatMap((session) => session.resourceIds.map((id) => ({ resource_id: id }))));
  const countOf = (resourceType: ResourceType) => resources.filter((resource) => resource.type === resourceType).length;
  const ofType = resources.filter((resource) => resource.type === type);
  const rows = ofType.map((resource) => ({
    id: resource.id,
    name: resource.name,
    seats: resource.seats,
    languages: resource.languages,
    weeklySessions: weekly.get(resource.id) ?? 0,
  }));

  return (
    <section className="flex flex-col gap-4 tablet:gap-5">
      <Header subtitle="Guías, vehículos y material. Se asignan a las salidas sin solaparse." action={<AddResourceButton type={type} />} />
      <ViewNav view={view} />
      <nav aria-label="Tipo de recurso" className="inline-flex flex-none gap-0.5 self-start rounded-[9px] bg-[#e8e8ed] p-[3px]">
        {RESOURCE_TYPES.map((option) => {
          const current = option === type;
          return (
            <Link
              key={option}
              href={`/panel/equipo?vista=fichas&tipo=${RESOURCE_TYPE_TEXT[option].slug}`}
              aria-current={current ? "page" : undefined}
              className={segmentClass(current)}
            >
              {RESOURCE_TYPE_TEXT[option].plural} <span className="font-mono text-[0.74rem] text-faint">{countOf(option)}</span>
            </Link>
          );
        })}
      </nav>
      <ResourceList key={type} type={type} rows={rows} languages={settings.languages} />
      {type === "guide" && ofType.length ? <WeeklyPlan guides={ofType} sessions={weekSessions} days={week} /> : null}
    </section>
  );
}

function Header({ subtitle, action }: { subtitle: string; action: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[1.25rem] tablet:text-[1.45rem]">Equipo</h1>
        <p className="mt-[3px] text-[0.86rem] text-muted-foreground">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function ViewNav({ view }: { view: "donde" | "fichas" }) {
  return (
    <nav aria-label="Vista del equipo" className="inline-flex flex-none gap-0.5 self-start rounded-[9px] bg-[#e8e8ed] p-[3px]">
      <Link href="/panel/equipo" aria-current={view === "donde" ? "page" : undefined} className={segmentClass(view === "donde")}>
        <MapPin aria-hidden="true" />
        Dónde están
      </Link>
      <Link
        href="/panel/equipo?vista=fichas"
        aria-current={view === "fichas" ? "page" : undefined}
        className={segmentClass(view === "fichas")}
      >
        <BadgeCheck aria-hidden="true" />
        Fichas y planificación
      </Link>
    </nav>
  );
}
