import Link from "next/link";
import { Bus, CircleAlert, Info, Package, UserRound, type LucideIcon } from "lucide-react";

import type { TeamResource } from "@/app/(panel)/panel/equipo/data";
import { Button } from "@/components/ui/button";
import { toBusinessDateTime } from "@/lib/domain/calendar";
import { RESOURCE_TYPES, RESOURCE_TYPE_TEXT, initials, type ResourceType } from "@/lib/domain/resources";
import {
  isPast,
  minutesInDay,
  paxText,
  resourceStatus,
  stackLanes,
  timelineHours,
  timelinePercent,
  unassignedSessions,
  whereaboutsKpis,
  type DaySession,
  type ResourceStatus,
  type StatusLevel,
} from "@/lib/domain/whereabouts";
import { cn } from "@/lib/utils";

const TYPE_ICONS: Record<ResourceType, LucideIcon> = { guide: UserRound, vehicle: Bus, equipment: Package };

const DOT: Record<StatusLevel, string> = {
  live: "bg-ok",
  soon: "bg-warn",
  free: "bg-primary",
  idle: "bg-[#c7c7cc]",
  done: "bg-[#c7c7cc]",
};

type Row = { resource: TeamResource; status: ResourceStatus };

/** Equipo · Dónde están: estado de cada recurso y línea de tiempo del día (tarjetas en móvil). */
export function Whereabouts({
  day,
  isToday,
  now,
  resources,
  sessions,
}: {
  day: string;
  isToday: boolean;
  now: Date;
  resources: TeamResource[];
  sessions: DaySession[];
}) {
  const rows: Row[] = resources.map((resource) => ({ resource, status: resourceStatus(resource.id, sessions, isToday, now) }));
  const kpis = whereaboutsKpis(
    rows.map((row) => row.status),
    sessions,
  );
  const hours = timelineHours(sessions, day);
  const hourMarks = Array.from({ length: hours.to - hours.from + 1 }, (_, index) => hours.from + index);
  const nowPercent = isToday ? timelinePercent(minutesInDay(now.toISOString(), day), hours) : null;
  const nowTime = toBusinessDateTime(now.toISOString()).time;
  const unassigned = unassignedSessions(sessions);
  const unassignedLanes = stackLanes(unassigned);
  const timeline = { day, hours, isToday, now, nowPercent };
  const groups = RESOURCE_TYPES.map((type) => ({ type, rows: rows.filter((row) => row.resource.type === type) })).filter(
    (group) => group.rows.length,
  );

  return (
    <>
      <dl className="grid grid-cols-2 overflow-hidden rounded-2xl border border-black/5 bg-surface shadow-card tablet:grid-cols-4">
        <Kpi index={0} label="En ruta" detail={isToday ? "ahora mismo" : "solo para hoy"} className={isToday ? "text-ok" : undefined}>
          {isToday ? kpis.live : "—"}
        </Kpi>
        <Kpi index={1} label="Salen en menos de 1 h" detail="preparando salida" className={kpis.soon ? "text-warn" : undefined}>
          {isToday ? kpis.soon : "—"}
        </Kpi>
        <Kpi index={2} label="Disponibles" detail={`de ${kpis.total} recursos`}>
          {kpis.available}
        </Kpi>
        <Kpi index={3} label="Salidas sin equipo" detail="con reservas este día" className={kpis.withoutEquipment ? "text-danger" : undefined}>
          {kpis.withoutEquipment}
        </Kpi>
      </dl>

      {groups.length ? (
        <>
          {/* Móvil: una tarjeta por recurso con sus salidas. */}
          <div className="overflow-hidden rounded-2xl border border-black/5 bg-surface shadow-card tablet:hidden">
            {unassigned.length ? (
              <section aria-label="Sin asignar" className="bg-danger-soft/50">
                <UnassignedTitle count={unassigned.length} />
                <div className="flex flex-wrap gap-1.5 px-3.5 pt-1 pb-3">
                  {unassigned.map((session) => (
                    <Link
                      key={session.id}
                      href={`/panel/salidas/${session.id}`}
                      className="inline-flex max-w-full items-center gap-1.5 overflow-hidden rounded-full border border-dashed border-danger/60 bg-surface py-[3px] pr-2.5 pl-2 text-[0.74rem]"
                    >
                      <i aria-hidden="true" className="size-2 flex-none rounded-full" style={{ background: session.color }} />
                      <b className="font-mono font-medium">{session.start}</b>
                      <span className="min-w-0 truncate">{session.productName}</span>
                      <span className="flex-none font-mono text-[0.68rem] text-muted-foreground">{paxText(session)}</span>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
            {groups.map((group) => (
              <section key={group.type} aria-label={RESOURCE_TYPE_TEXT[group.type].plural}>
                <GroupTitle type={group.type} />
                <ul>
                  {group.rows.map(({ resource, status }) => (
                    <li key={resource.id} aria-label={resource.name} className="border-t border-line-2 px-3.5 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar resource={resource} />
                        <div className="min-w-0 flex-1">
                          <b className="block truncate">{resource.name}</b>
                          <StatusLine status={status} />
                        </div>
                      </div>
                      {status.level !== "idle" ? <p className="mt-1 text-[0.78rem] text-faint">{status.sub}</p> : null}
                      {status.sessions.length ? <MiniTrack sessions={status.sessions} currentId={status.currentId} {...timeline} /> : null}
                      {status.sessions.length ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {status.sessions.map((session) => (
                            <Link
                              key={session.id}
                              href={`/panel/salidas/${session.id}`}
                              className={cn(
                                "inline-flex max-w-full items-center gap-1.5 overflow-hidden rounded-full border border-line bg-surface py-[3px] pr-2.5 pl-2 text-[0.74rem]",
                                isToday && isPast(session, now) && "opacity-50",
                              )}
                            >
                              <i aria-hidden="true" className="size-2 flex-none rounded-full" style={{ background: session.color }} />
                              <b className="font-mono font-medium">{session.start}</b>
                              <span className="min-w-0 truncate">{session.place}</span>
                            </Link>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {/* Tablet y escritorio: línea de tiempo. */}
          <div className="overflow-hidden rounded-2xl border border-black/5 bg-surface shadow-card max-tablet:hidden">
            <div className="overflow-x-auto">
              <div className="min-w-[860px]" role="table" aria-label="Línea de tiempo del equipo">
                <div role="row" className="sticky top-0 z-[3] grid grid-cols-[270px_minmax(0,1fr)] bg-surface-2">
                  <div role="columnheader" className="border-r border-line-2 px-4 py-2.5 text-[0.72rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                    Recurso · estado
                  </div>
                  <div role="columnheader" className="relative h-9" aria-label="Horas">
                    {hourMarks.map((hour, index) => (
                      <span
                        key={hour}
                        className={cn(
                          "absolute top-[11px] font-mono text-[0.66rem] text-faint",
                          index === 0 ? "pl-1" : "-translate-x-1/2",
                          index === hourMarks.length - 1 && "hidden",
                        )}
                        style={{ left: `${(index / (hours.to - hours.from)) * 100}%` }}
                      >
                        {String(hour % 24).padStart(2, "0")}:00
                      </span>
                    ))}
                    {nowPercent !== null ? (
                      <span
                        className="absolute top-[7px] z-[2] -translate-x-1/2 rounded-full bg-[#ff3b30] px-1.5 py-px font-mono text-[0.66rem] font-semibold text-white shadow-[0_1px_2px_rgb(0_0_0/0.2)]"
                        style={{ left: `${nowPercent}%` }}
                      >
                        <span className="sr-only">Ahora: </span>
                        {nowTime}
                      </span>
                    ) : null}
                  </div>
                </div>
                {unassignedLanes.length ? (
                  <div role="rowgroup" className="bg-danger-soft/40">
                    <div role="row">
                      <div role="cell">
                        <UnassignedTitle count={unassigned.length} />
                      </div>
                    </div>
                    {unassignedLanes.map((lane, index) => (
                      <div key={index} role="row" aria-label={index ? undefined : "Sin asignar"} className="grid grid-cols-[270px_minmax(0,1fr)] border-t border-line-2">
                        <div role="cell" className="flex min-w-0 items-center gap-2.5 border-r border-line-2 px-4 py-2.5">
                          {index === 0 ? (
                            <>
                              <span aria-hidden="true" className="grid size-8 flex-none place-items-center rounded-full border border-dashed border-danger/60 text-danger">
                                <CircleAlert className="size-4" />
                              </span>
                              <div className="min-w-0">
                                <b className="block truncate text-danger">Falta equipo</b>
                                <p className="truncate text-[0.76rem] text-faint">Pulsa una salida para asignarla</p>
                              </div>
                            </>
                          ) : null}
                        </div>
                        <Track hours={hours} nowPercent={nowPercent}>
                          {lane.map((session) => (
                            <Block key={session.id} session={session} day={day} hours={hours} unassigned faded={isToday && isPast(session, now)} />
                          ))}
                        </Track>
                      </div>
                    ))}
                  </div>
                ) : null}
                {groups.map((group) => (
                  <div key={group.type} role="rowgroup">
                    <div role="row">
                      <div role="cell">
                        <GroupTitle type={group.type} />
                      </div>
                    </div>
                    {group.rows.map(({ resource, status }) => (
                      <div key={resource.id} role="row" aria-label={resource.name} className="grid grid-cols-[270px_minmax(0,1fr)] border-t border-line-2">
                        <div role="cell" className="flex min-w-0 items-center gap-2.5 border-r border-line-2 px-4 py-2.5">
                          <Avatar resource={resource} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <b className="truncate">{resource.name}</b>
                              {resource.type === "guide" ? (
                                <span className="font-mono text-[0.66rem] text-faint">
                                  {resource.languages.map((code) => code.toUpperCase()).join(" ")}
                                </span>
                              ) : null}
                            </div>
                            <StatusLine status={status} />
                            <p className="truncate text-[0.76rem] text-faint">{status.sub}</p>
                          </div>
                        </div>
                        <Track hours={hours} nowPercent={nowPercent}>
                          {status.sessions.map((session) => (
                            <Block
                              key={session.id}
                              session={session}
                              day={day}
                              hours={hours}
                              live={status.currentId === session.id}
                              faded={isToday && isPast(session, now)}
                            />
                          ))}
                        </Track>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-black/5 bg-surface px-5 py-9 text-center text-muted-foreground shadow-card">
          <UserRound aria-hidden="true" className="size-8 text-faint" />
          <b className="text-foreground">No hay recursos</b>
          <span className="text-[0.86rem]">Añade guías y vehículos en Fichas y planificación.</span>
          <Button asChild variant="outline" className="mt-1">
            <Link href="/panel/equipo?vista=fichas">Ir a fichas</Link>
          </Button>
        </div>
      )}

      <p className="flex items-center gap-1.5 text-[0.78rem] text-faint">
        <Info aria-hidden="true" className="size-3.5 flex-none" />
        La ubicación sale de la salida asignada (zona del recorrido y punto de encuentro).
      </p>
    </>
  );
}

function GroupTitle({ type }: { type: ResourceType }) {
  const Icon = TYPE_ICONS[type];
  return (
    <h2 className="flex items-center gap-1.5 border-t border-line-2 bg-surface-2 px-4 py-2 text-[0.68rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase first:border-t-0">
      <Icon aria-hidden="true" className="size-3.5" />
      {RESOURCE_TYPE_TEXT[type].plural}
    </h2>
  );
}

function Avatar({ resource }: { resource: TeamResource }) {
  const Icon = TYPE_ICONS[resource.type];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-8 flex-none place-items-center rounded-full text-[0.74rem] font-semibold",
        resource.type === "guide" ? "bg-primary-soft text-primary-dark" : "bg-[#e8e8ed] text-muted-foreground",
      )}
    >
      {resource.type === "guide" ? initials(resource.name) : <Icon className="size-4" />}
    </span>
  );
}

function StatusLine({ status }: { status: ResourceStatus }) {
  return (
    <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[0.78rem] font-medium">
      <i aria-hidden="true" className={cn("size-2 flex-none rounded-full", DOT[status.level])} />
      <span className="truncate">{status.title}</span>
    </div>
  );
}

function Kpi({
  index,
  label,
  detail,
  className,
  children,
}: {
  index: number;
  label: string;
  detail: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "min-w-0 px-3.5 py-3 tablet:px-[18px] tablet:py-3.5",
        index % 2 === 1 && "border-l border-line-2",
        index >= 2 && "border-t border-line-2 tablet:border-t-0",
        index === 2 && "tablet:border-l",
      )}
    >
      <dt className="text-[0.72rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">{label}</dt>
      <dd className={cn("mt-[3px] text-[1.25rem] font-semibold tracking-[-0.03em] tabular-nums tablet:text-[1.6rem]", className)}>
        {children}
      </dd>
      <dd className="text-[0.76rem] text-muted-foreground">{detail}</dd>
    </div>
  );
}

type Hours = { from: number; to: number };

/** Pista de horas de una fila: rayas de cada hora y la línea roja de «ahora». */
function Track({ hours, nowPercent, children }: { hours: Hours; nowPercent: number | null; children: React.ReactNode }) {
  return (
    <div
      role="cell"
      className="relative min-h-[62px]"
      style={{
        backgroundImage: "linear-gradient(to right, var(--color-line-2) 1px, transparent 1px)",
        backgroundSize: `calc(100% / ${hours.to - hours.from}) 100%`,
      }}
    >
      {children}
      {nowPercent !== null ? (
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 z-[2] w-0.5 bg-[#ff3b30]" style={{ left: `${nowPercent}%` }} />
      ) : null}
    </div>
  );
}

/** Bloque de una salida en la línea de tiempo, con una barra abajo que marca lo lleno que va. */
function Block({
  session,
  day,
  hours,
  live = false,
  faded,
  unassigned = false,
}: {
  session: DaySession;
  day: string;
  hours: Hours;
  live?: boolean;
  faded: boolean;
  unassigned?: boolean;
}) {
  const left = timelinePercent(minutesInDay(session.startsAt, day), hours);
  const right = timelinePercent(minutesInDay(session.endsAt, day), hours);
  const fill = session.capacity ? Math.min(100, (session.booked / session.capacity) * 100) : 0;
  return (
    <Link
      href={`/panel/salidas/${session.id}`}
      title={`${session.productName} · ${session.start}–${session.end} · ${paxText(session)}${unassigned ? " · falta equipo" : ""}`}
      className={cn(
        "absolute top-3 bottom-3 flex items-center gap-1 overflow-hidden rounded-[9px] px-[9px] text-[0.72rem] whitespace-nowrap hover:brightness-110",
        unassigned
          ? "border-[1.5px] border-dashed bg-surface text-foreground hover:bg-danger-soft"
          : "text-white shadow-[0_1px_3px_rgb(0_0_0/0.15)]",
        faded && "opacity-45",
        live && "ring-2 ring-ok ring-offset-2",
      )}
      style={{
        left: `${left}%`,
        width: `${Math.max(2, right - left)}%`,
        ...(unassigned ? { borderColor: session.color } : { background: session.color }),
      }}
    >
      <b className="font-mono font-medium">{session.start}</b>
      <span className="truncate">
        {unassigned ? session.productName : session.place} · {session.language.toUpperCase()} · {paxText(session)}
      </span>
      <span aria-hidden="true" className={cn("absolute inset-x-0 bottom-0 h-[3px]", unassigned ? "bg-line-2" : "bg-black/20")}>
        <span className={cn("block h-full", unassigned ? "bg-danger" : "bg-white/85")} style={{ width: `${fill}%` }} />
      </span>
    </Link>
  );
}

/** Móvil: el día del recurso en una barra fina, con sus salidas y la hora actual. */
function MiniTrack({
  sessions,
  currentId,
  day,
  hours,
  isToday,
  now,
  nowPercent,
}: {
  sessions: DaySession[];
  currentId: string | null;
  day: string;
  hours: Hours;
  isToday: boolean;
  now: Date;
  nowPercent: number | null;
}) {
  return (
    <div aria-hidden="true" className="mt-2.5">
      <div className="relative h-2 rounded-full bg-line-2">
        {sessions.map((session) => {
          const left = timelinePercent(minutesInDay(session.startsAt, day), hours);
          const right = timelinePercent(minutesInDay(session.endsAt, day), hours);
          return (
            <span
              key={session.id}
              className={cn(
                "absolute inset-y-0 rounded-full",
                isToday && isPast(session, now) && "opacity-45",
                currentId === session.id && "ring-2 ring-ok ring-offset-1",
              )}
              style={{ left: `${left}%`, width: `${Math.max(2, right - left)}%`, background: session.color }}
            />
          );
        })}
        {nowPercent !== null ? (
          <span className="absolute -inset-y-1 w-0.5 rounded-full bg-[#ff3b30]" style={{ left: `${nowPercent}%` }} />
        ) : null}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[0.62rem] text-faint">
        <span>{String(hours.from).padStart(2, "0")}:00</span>
        <span>{String(hours.to % 24).padStart(2, "0")}:00</span>
      </div>
    </div>
  );
}

function UnassignedTitle({ count }: { count: number }) {
  return (
    <h2 className="flex items-center gap-1.5 border-t border-line-2 px-4 py-2 text-[0.68rem] font-semibold tracking-[0.08em] text-danger uppercase first:border-t-0">
      <CircleAlert aria-hidden="true" className="size-3.5" />
      Sin asignar · {count}
    </h2>
  );
}
