import Link from "next/link";
import { CalendarX2, Plus } from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

import { EmptyState } from "@/components/empty-state";
import { calendarHref, groupByDate, occupancyLevel, occupancyTotals, sessionSummary } from "@/lib/domain/calendar";
import { minutesOf, tickLabel } from "@/lib/domain/day-timeline";
import { dayLayout, daySummary, hourMarks, minuteOffset, nowOffset, type DayBlock } from "@/lib/domain/day-view";
import { cn } from "@/lib/utils";

import { CrewAvatars } from "./crew-avatars";
import { STATE_LABELED, SessionStatus, calendarState, seatToneClass } from "./session-status";
import type { CalendarSession } from "./types";

// Ancho de la columna de horas, a la izquierda.
const GUTTER = "3.25rem";

/**
 * Vista «Día»: la semana en una tira de días para saltar entre ellos, las cifras del día y sus
 * salidas en una columna de horas (alto según lo que duran, en carriles si coinciden) con la
 * línea roja de «ahora» si es hoy.
 */
export function DayView({
  day,
  days,
  sessions,
  today,
  nowTime,
  productId,
}: {
  day: string;
  days: readonly string[];
  sessions: readonly CalendarSession[];
  today: string;
  /** Hora de Canarias ahora, «HH:mm». */
  nowTime: string;
  productId: string | null;
}) {
  const byDate = groupByDate(sessions);
  const list = byDate.get(day) ?? [];
  const summary = daySummary(list);

  return (
    <div className="flex flex-col gap-3 tablet:gap-4">
      <nav aria-label="Días de la semana" className="grid grid-cols-7 gap-1 tablet:gap-1.5">
        {days.map((item) => {
          const totals = occupancyTotals(byDate.get(item) ?? []);
          const level = occupancyLevel(totals.booked, totals.capacity);
          const current = item === day;
          const date = parseISO(item);
          return (
            <Link
              key={item}
              href={calendarHref({ view: "dia", anchor: item, productId })}
              aria-current={current ? "date" : undefined}
              aria-label={`${format(date, "EEEE d", { locale: es })}${item === today ? " (hoy)" : ""}: ${totals.booked} pax`}
              className={cn(
                "flex min-w-0 flex-col items-center gap-1 rounded-xl border px-0.5 pt-1.5 pb-2 transition-colors",
                current
                  ? "border-primary bg-primary text-white shadow-[0_4px_14px_rgb(10_132_255/0.3)]"
                  : "border-black/5 bg-surface hover:border-line hover:bg-surface-2",
              )}
            >
              <span className={cn("text-[0.68rem] font-medium uppercase", current ? "text-white/80" : "text-muted-foreground")}>
                {format(date, "EEEEEE", { locale: es })}
              </span>
              <span className={cn("text-[1.05rem] leading-none font-semibold tabular-nums", !current && item === today && "text-primary")}>
                {format(date, "d")}
              </span>
              {/* Barrita de ocupación del día: más llena cuanto más vendido. */}
              <span aria-hidden="true" className={cn("h-1 w-6 overflow-hidden rounded-full", current ? "bg-white/30" : "bg-line-2")}>
                <span
                  className={cn("block h-full rounded-full", current ? "bg-white" : "bg-primary")}
                  style={{ width: `${level * 25}%` }}
                />
              </span>
            </Link>
          );
        })}
      </nav>

      <dl aria-label="Resumen del día" className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-black/5 bg-line-2 shadow-card tablet:grid-cols-4">
        <Stat label="Salidas" value={String(summary.sessions)} />
        <Stat label="Pasajeros" value={`${summary.booked}`} detail={summary.capacity ? `de ${summary.capacity} plazas` : undefined} />
        <Stat label="Ocupación" value={`${summary.percent} %`} meter={summary.percent} />
        <Stat
          label="Sin equipo"
          value={String(summary.unstaffed)}
          className={summary.unstaffed ? "text-danger" : "text-ok"}
          detail={summary.unstaffed ? "con reservas" : "todo cubierto"}
        />
      </dl>

      {list.length ? (
        <Timeline sessions={list} nowTime={day === today ? nowTime : null} />
      ) : (
        <div className="rounded-2xl border border-black/5 bg-surface shadow-card">
          <EmptyState icon={CalendarX2} title="Sin salidas este día" text="Prueba otro día de la semana o quita el filtro de producto." />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, detail, meter, className }: { label: string; value: string; detail?: string; meter?: number; className?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 bg-surface px-4 py-3">
      <dt className="text-[0.7rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">{label}</dt>
      <dd className={cn("text-[1.35rem] leading-tight font-semibold tabular-nums", className)}>{value}</dd>
      {detail ? <dd className="truncate text-[0.76rem] text-muted-foreground">{detail}</dd> : null}
      {meter !== undefined ? (
        <dd aria-hidden="true" className="mt-1 h-1.5 overflow-hidden rounded-full bg-line-2">
          <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, meter)}%` }} />
        </dd>
      ) : null}
    </div>
  );
}

function Timeline({ sessions, nowTime }: { sessions: readonly CalendarSession[]; nowTime: string | null }) {
  const { window, height, blocks } = dayLayout(sessions);
  const now = nowTime ? nowOffset(minutesOf(nowTime), window) : null;
  return (
    <div className="rounded-2xl border border-black/5 bg-surface px-2 py-4 shadow-card tablet:px-3">
      <div className="relative" style={{ height }}>
        {/* Líneas de cada hora con su etiqueta. */}
        {hourMarks(window).map((minute) => (
          <div key={minute} aria-hidden="true" className="absolute inset-x-0 flex items-start" style={{ top: minuteOffset(minute, window) }}>
            <span className="-mt-[0.55em] shrink-0 pr-2 text-right font-mono text-[0.7rem] text-faint tabular-nums" style={{ width: GUTTER }}>
              {tickLabel(minute)}
            </span>
            <span className="h-px flex-1 bg-line-2" />
          </div>
        ))}

        <ul aria-label="Salidas del día" className="absolute inset-y-0 right-0" style={{ left: GUTTER }}>
          {sessions.map((session) => {
            const block = blocks.get(session.id);
            return block ? <DayBlockCard key={session.id} session={session} block={block} /> : null;
          })}
        </ul>

        {now !== null ? (
          <div aria-hidden="true" className="pointer-events-none absolute right-0 z-20 flex items-center" style={{ top: now, left: `calc(${GUTTER} - 5px)` }}>
            <span className="size-2.5 flex-none rounded-full bg-danger shadow-[0_0_0_3px_var(--surface)]" />
            <span className="h-0.5 flex-1 bg-danger" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DayBlockCard({ session, block }: { session: CalendarSession; block: DayBlock }) {
  const state = calendarState(session);
  const percent = session.capacity ? Math.min(100, (session.booked / session.capacity) * 100) : 0;
  // Las salidas cortas solo enseñan lo básico.
  const roomy = block.height >= 120;
  return (
    <li
      title={sessionSummary({
        time: session.time,
        productName: session.product.name,
        language: session.language,
        booked: session.booked,
        capacity: session.capacity,
        stateLabel: STATE_LABELED.has(state.kind) ? state.label : undefined,
        crew: session.crew,
      })}
      className={cn(
        // Contenedor: lo que no cabe en un carril estrecho (móvil con varias a la vez) se esconde.
        "@container absolute flex flex-col gap-1 overflow-hidden rounded-xl border border-black/6 py-2 pr-2 pl-3 shadow-[0_1px_2px_rgb(16_24_40/0.06)] transition-shadow hover:z-10 hover:shadow-[0_6px_20px_rgb(16_24_40/0.14)]",
        "has-[a:focus-visible]:ring-[3px] has-[a:focus-visible]:ring-ring/50",
        session.past && "opacity-55",
        session.status === "cancelled" && "bg-surface-2",
      )}
      style={{
        top: block.top + 1,
        height: block.height - 3,
        left: `calc(${(block.lane / block.lanes) * 100}% + 2px)`,
        width: `calc(${100 / block.lanes}% - 4px)`,
        // Fondo teñido con el color del producto, como los bloques de Google Calendar.
        background: session.status === "cancelled" ? undefined : `color-mix(in srgb, ${session.product.color} 11%, var(--surface))`,
      }}
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1" style={{ background: session.product.color }} />
      <div className={cn("flex items-center gap-1.5 text-[0.76rem]", state.panelBookable && "@min-[7rem]:pr-8")}>
        <span className={cn("font-mono font-semibold tabular-nums", session.status === "cancelled" && "line-through")}>
          {session.time}
          <span className="font-normal text-muted-foreground @max-[11rem]:hidden">–{session.endTime}</span>
        </span>
        <span className="rounded-[4px] border border-line bg-surface px-[5px] py-px font-mono text-[0.64rem] font-medium text-muted-foreground @max-[7rem]:hidden">
          {session.language.toUpperCase()}
        </span>
        {state.panelBookable ? (
          // Por encima del enlace de la tarjeta: reservar sin pasar por el manifiesto.
          <Link
            href={`/panel/reservas/nueva?salida=${session.id}`}
            aria-label={`Reservar ${session.time} ${session.product.name}`}
            title="Reservar"
            className="absolute top-1.5 right-1.5 z-10 grid size-7 @max-[7rem]:hidden flex-none place-items-center rounded-full bg-surface text-primary shadow-[0_1px_2px_rgb(16_24_40/0.12)] hover:bg-primary hover:text-white focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <Plus aria-hidden="true" className="size-4" />
          </Link>
        ) : null}
      </div>
      <Link
        href={`/panel/salidas/${session.id}`}
        aria-label={`Manifiesto ${session.time} ${session.product.name}`}
        className={cn(
          "min-w-0 text-[0.84rem] leading-tight font-semibold break-words outline-none after:absolute after:inset-0 after:rounded-xl",
          // En las salidas cortas el nombre va en una línea para que se vean las plazas.
          block.height < 110 ? "line-clamp-1" : "line-clamp-2",
        )}
      >
        {session.product.name}
      </Link>
      <div className="flex items-center gap-2 text-[0.76rem] text-muted-foreground">
        <span className="font-mono tabular-nums">
          {session.booked}/{session.capacity}
        </span>
        <span
          role="progressbar"
          aria-label="Ocupación"
          aria-valuemin={0}
          aria-valuemax={Math.max(1, session.capacity)}
          aria-valuenow={session.booked}
          className="h-[5px] min-w-0 flex-1 overflow-hidden rounded-full bg-black/8 @max-[4rem]:hidden"
        >
          <span className={cn("block h-full rounded-full", seatToneClass(state.kind))} style={{ width: `${percent}%` }} />
        </span>
      </div>
      {roomy ? (
        <div className="mt-auto flex flex-wrap items-center gap-1.5">
          <CrewAvatars crew={session.crew} className="@max-[4rem]:hidden" />
          <SessionStatus session={session} className="@max-[6rem]:hidden" />
        </div>
      ) : null}
    </li>
  );
}
