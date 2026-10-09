import Link from "next/link";

import { cn } from "@/lib/utils";
import { groupByDate, occupancyTotals, weekdayLabel } from "@/lib/domain/calendar";

import { SessionStatus } from "./session-status";
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
  const full = session.status !== "cancelled" && session.capacity > 0 && session.booked >= session.capacity;
  const percent = session.capacity ? Math.min(100, (session.booked / session.capacity) * 100) : 0;
  return (
    <li
      className={cn(
        "relative flex w-full flex-col gap-1.5 rounded-xl border border-black/6 bg-surface px-2.5 py-[9px] shadow-[0_1px_2px_rgb(16_24_40/0.04)] hover:border-line",
        "has-[a:focus-visible]:ring-[3px] has-[a:focus-visible]:ring-ring/50",
        session.past && "opacity-55",
      )}
    >
      <div className="flex items-center justify-between text-[0.8rem]">
        <span className="font-mono tabular-nums">{session.time}</span>
        <span className="rounded-[4px] border border-line bg-surface px-[5px] py-px font-mono text-[0.68rem] font-medium text-muted-foreground">
          {session.language.toUpperCase()}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5 text-[0.82rem] leading-tight font-semibold">
        <span aria-hidden="true" className="size-2.5 flex-none rounded-[3px]" style={{ background: session.product.color }} />
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
        <div className={cn("h-full rounded-full", full ? "bg-[#ff9f0a]" : "bg-primary")} style={{ width: `${percent}%` }} />
      </div>
      <div className="flex items-center justify-between gap-2 text-[0.8rem] text-muted-foreground">
        <span className="font-mono tabular-nums">
          {session.booked}/{session.capacity}
        </span>
        <SessionStatus session={session} />
      </div>
    </li>
  );
}
