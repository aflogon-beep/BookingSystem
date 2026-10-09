import Link from "next/link";
import { parseISO } from "date-fns";

import { cn } from "@/lib/utils";
import { calendarHref, groupByDate, longDayLabel, occupancyLevel, occupancyTotals } from "@/lib/domain/calendar";

import type { CalendarSession } from "./types";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MAX_LINES = 3;
const MAX_DOTS = 6;

// Barra inferior de cada día según la ocupación (heat-1 … heat-4 del prototipo).
const HEAT = [
  "",
  "shadow-[inset_0_-3px_0_#cce3fa]",
  "shadow-[inset_0_-3px_0_#80bbf3]",
  "shadow-[inset_0_-3px_0_#0071e3]",
  "shadow-[inset_0_-3px_0_#ff9f0a]",
] as const;

/**
 * Mes en cuadrícula. En escritorio cada día lista hasta 3 salidas; en tablet sin nombre y en
 * móvil solo puntos de color. Pulsar un día abre su semana.
 */
export function MonthView({
  days,
  month,
  sessions,
  today,
  productId,
}: {
  days: readonly string[];
  /** «2026-10»: los días de otros meses salen en gris. */
  month: string;
  sessions: readonly CalendarSession[];
  today: string;
  productId: string | null;
}) {
  const byDate = groupByDate(sessions);
  const monthTotals = occupancyTotals(sessions.filter((session) => session.date.startsWith(month)));
  const monthCount = sessions.filter((session) => session.date.startsWith(month) && session.status !== "cancelled").length;
  const percent = monthTotals.capacity ? Math.round((monthTotals.booked / monthTotals.capacity) * 100) : 0;

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-black/5 bg-surface shadow-card">
        <div className="grid grid-cols-7">
          {WEEKDAYS.map((weekday) => (
            <div
              key={weekday}
              aria-hidden="true"
              className="border-b border-line bg-surface-2 px-0.5 py-1.5 text-center text-[0.6rem] font-semibold tracking-[0.07em] text-muted-foreground uppercase tablet:px-2.5 tablet:py-2 tablet:text-left tablet:text-[0.68rem]"
            >
              {weekday}
            </div>
          ))}
          {days.map((day) => {
            const list = byDate.get(day) ?? [];
            const totals = occupancyTotals(list);
            const outside = !day.startsWith(month);
            const isToday = day === today;
            const live = list.filter((session) => session.status !== "cancelled").length;
            const label = `${longDayLabel(day)}: ${live ? `${live} ${live === 1 ? "salida" : "salidas"}, ${totals.booked} de ${totals.capacity} plazas` : "sin salidas"}`;
            return (
              <Link
                key={day}
                href={calendarHref({ view: "semana", anchor: day, productId })}
                aria-label={isToday ? `${label} (hoy)` : label}
                className={cn(
                  "flex min-h-16 min-w-0 flex-col gap-[3px] border-r border-b border-line-2 p-1 text-left hover:bg-[#f7fafe] tablet:min-h-[92px] tablet:px-[7px] tablet:pt-[7px] tablet:pb-2 desk:min-h-[118px] [&:nth-child(7n)]:border-r-0",
                  outside ? "bg-surface-2" : "bg-surface",
                  HEAT[occupancyLevel(totals.booked, totals.capacity)],
                )}
              >
                <div className="mb-0.5 flex items-center justify-between">
                  <span
                    className={cn(
                      "grid size-6 place-items-center rounded-full text-[0.8rem] font-semibold",
                      isToday && "bg-primary text-white",
                      outside && !isToday && "text-faint",
                    )}
                  >
                    {parseISO(day).getDate()}
                  </span>
                  {totals.capacity ? (
                    <span className="hidden font-mono text-[0.66rem] text-muted-foreground tablet:inline">
                      {totals.booked}/{totals.capacity}
                    </span>
                  ) : null}
                </div>
                {list.slice(0, MAX_LINES).map((session) => (
                  <span
                    key={session.id}
                    className={cn(
                      "hidden min-w-0 items-center gap-[5px] rounded-[4px] px-1 py-px text-[0.72rem] leading-[1.3] tablet:flex",
                      session.status !== "cancelled" && session.capacity > 0 && session.booked >= session.capacity ? "bg-warn-soft" : "bg-surface-2",
                      session.status === "cancelled" && "line-through opacity-45",
                    )}
                  >
                    <span aria-hidden="true" className="size-[7px] flex-none rounded-[3px]" style={{ background: session.product.color }} />
                    <span className="flex-none font-mono text-muted-foreground">{session.time}</span>
                    <span className="min-w-0 flex-1 truncate max-desk:hidden">{session.product.name}</span>
                    <span className="flex-none font-mono text-[0.66rem] text-muted-foreground max-desk:ml-auto">
                      {session.booked}/{session.capacity}
                    </span>
                  </span>
                ))}
                {list.length > MAX_LINES ? (
                  <span className="hidden pl-1 text-[0.7rem] font-medium text-primary tablet:inline">
                    +{list.length - MAX_LINES} más
                  </span>
                ) : null}
                {list.length ? (
                  <span aria-hidden="true" className="mt-auto flex flex-wrap gap-[3px] tablet:hidden">
                    {list.slice(0, MAX_DOTS).map((session) => (
                      <i key={session.id} className="block size-1.5 rounded-full" style={{ background: session.product.color }} />
                    ))}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[0.8rem] text-muted-foreground">
        <LegendItem color="#cce3fa">Ocupación baja</LegendItem>
        <LegendItem color="#0071e3">Alta</LegendItem>
        <LegendItem color="#ff9f0a">Casi completo</LegendItem>
        <span className="tabular-nums tablet:ml-auto">
          {monthCount} {monthCount === 1 ? "salida" : "salidas"} · {monthTotals.booked}/{monthTotals.capacity} plazas ({percent}%)
        </span>
      </div>
    </>
  );
}

function LegendItem({ color, children }: { color: string; children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <i aria-hidden="true" className="size-2.5 rounded-[3px]" style={{ background: color }} />
      {children}
    </span>
  );
}
