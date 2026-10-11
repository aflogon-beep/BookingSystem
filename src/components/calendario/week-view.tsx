import Link from "next/link";
import { Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { groupByDate, occupancyTotals, sessionSummary, weekdayLabel } from "@/lib/domain/calendar";

import { CrewAvatars } from "./crew-avatars";
import { STATE_LABELED, SessionStatus, calendarState, seatToneClass } from "./session-status";
import type { CalendarSession } from "./types";

/** Semana en columnas: 7 en escritorio, 4 en tablet y 1 en móvil. */
export function WeekView({ days, sessions, today }: { days: readonly string[]; sessions: readonly CalendarSession[]; today: string }) {
  const byDate = groupByDate(sessions);
  return (
    <div className="grid grid-cols-1 gap-2.5 tablet:grid-cols-4 desk:grid-cols-7">
      {days.map((day) => {
        const list = byDate.get(day) ?? [];
        const isToday = day === today;
        return (
          <section key={day} aria-label={weekdayLabel(day)} className="flex min-w-0 flex-col gap-[7px]">
            <div
              className={cn(
                "flex items-baseline justify-between border-b-2 px-0.5 pt-1 pb-[7px]",
                isToday ? "border-primary" : "border-line",
              )}
            >
              <b className={cn("font-semibold capitalize", isToday && "text-primary")}>
                {weekdayLabel(day)}
                {isToday ? <span className="sr-only"> (hoy)</span> : null}
              </b>
              <span className="text-[0.8rem] text-faint tabular-nums">{occupancyTotals(list).booked} pax</span>
            </div>
            {list.length ? (
              <ul aria-label={`Salidas del ${weekdayLabel(day)}`} className="flex flex-col gap-[7px]">
                {list.map((session) => (
                  <WeekCard key={session.id} session={session} />
                ))}
              </ul>
            ) : (
              <span className="px-1 text-[0.8rem] text-faint">Sin salidas</span>
            )}
          </section>
        );
      })}
    </div>
  );
}

function WeekCard({ session }: { session: CalendarSession }) {
  const state = calendarState(session);
  const percent = session.capacity ? Math.min(100, (session.booked / session.capacity) * 100) : 0;
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
        "relative flex w-full flex-col gap-1.5 overflow-hidden rounded-xl border border-black/6 bg-surface py-[9px] pr-2.5 pl-3.5 shadow-[0_1px_2px_rgb(16_24_40/0.04)] hover:border-line hover:shadow-[0_2px_8px_rgb(16_24_40/0.08)]",
        "has-[a:focus-visible]:ring-[3px] has-[a:focus-visible]:ring-ring/50",
        session.past && "opacity-55",
        session.status === "cancelled" && "bg-surface-2",
      )}
    >
      {/* Franja del color del producto, como los bloques de FareHarbor. */}
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1" style={{ background: session.product.color }} />
      <div className="flex items-center justify-between text-[0.8rem]">
        <span className={cn("font-mono font-semibold tabular-nums", session.status === "cancelled" && "line-through")}>{session.time}</span>
        <span className="rounded-[4px] border border-line bg-surface px-[5px] py-px font-mono text-[0.68rem] font-medium text-muted-foreground">
          {session.language.toUpperCase()}
        </span>
      </div>
      <div className="text-[0.82rem] leading-tight font-semibold">
        {/* Toda la tarjeta abre el manifiesto de la salida. */}
        <Link
          href={`/panel/salidas/${session.id}`}
          aria-label={`Manifiesto ${session.time} ${session.product.name}`}
          className="min-w-0 break-words outline-none after:absolute after:inset-0 after:rounded-xl"
        >
          {session.product.name}
        </Link>
      </div>
      <div
        role="progressbar"
        aria-label="Ocupación"
        aria-valuemin={0}
        aria-valuemax={Math.max(1, session.capacity)}
        aria-valuenow={session.booked}
        className="h-[5px] overflow-hidden rounded-full bg-line-2"
      >
        <div className={cn("h-full rounded-full", seatToneClass(state.kind))} style={{ width: `${percent}%` }} />
      </div>
      <div className="flex items-center justify-between gap-2 text-[0.8rem] text-muted-foreground">
        <span className="font-mono tabular-nums">
          {session.booked}/{session.capacity}
        </span>
        <CrewAvatars crew={session.crew} />
      </div>
      <SessionStatus session={session} className="self-start" />
      {state.panelBookable ? (
        // Por encima del enlace de la tarjeta: reservar sin pasar por el manifiesto.
        <Link
          href={`/panel/reservas/nueva?salida=${session.id}`}
          aria-label={`Reservar ${session.time} ${session.product.name}`}
          className="relative z-10 -mx-1 -mb-1 flex min-h-9 items-center justify-center gap-1 rounded-lg text-[0.8rem] font-medium text-primary hover:bg-primary-soft focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Plus aria-hidden="true" className="size-3.5" />
          Reservar
        </Link>
      ) : null}
    </li>
  );
}
