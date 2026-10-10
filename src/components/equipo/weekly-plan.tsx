import Link from "next/link";

import { Box } from "@/components/ajustes/box";
import { weekdayLabel } from "@/lib/domain/calendar";
import { initials } from "@/lib/domain/resources";
import { weeklyPlan, type PlanSession } from "@/lib/domain/whereabouts";
import { hexMix } from "@/lib/product-art";

/** Planificación de esta semana: qué salidas tiene cada guía cada día. */
export function WeeklyPlan({
  guides,
  sessions,
  days,
}: {
  guides: { id: string; name: string }[];
  sessions: PlanSession[];
  days: string[];
}) {
  const rows = weeklyPlan(guides, sessions, days);
  return (
    <Box
      title="Planificación de esta semana"
      action={<span className="text-[0.8rem] text-muted-foreground">Salidas asignadas a cada guía</span>}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-[0.78rem]">
          <thead>
            <tr className="border-b border-line-2 text-[0.72rem] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
              <th scope="col" className="px-4 py-2.5 text-left">
                Guía
              </th>
              {days.map((day) => (
                <th key={day} scope="col" className="px-2 py-2.5 text-center first-letter:uppercase">
                  {weekdayLabel(day)}
                </th>
              ))}
              <th scope="col" className="px-4 py-2.5 text-center">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.guide.id} aria-label={row.guide.name} className="border-b border-line-2 last:border-b-0">
                <th scope="row" className="px-4 py-2 text-left font-normal whitespace-nowrap">
                  <span className="inline-flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="grid size-7 place-items-center rounded-full bg-primary-soft text-[0.7rem] font-semibold text-primary-dark"
                    >
                      {initials(row.guide.name)}
                    </span>
                    {row.guide.name}
                  </span>
                </th>
                {row.days.map((list, index) => (
                  <td key={days[index]} className="px-2 py-2 text-center align-top">
                    {list.length ? (
                      list.map((session) => (
                        <Link
                          key={session.id}
                          href={`/panel/salidas/${session.id}`}
                          title={session.productName}
                          className="my-0.5 block rounded px-1 py-px font-mono text-[0.68rem] whitespace-nowrap"
                          style={{ background: hexMix(session.color, "#FFFFFF", 0.82), color: hexMix(session.color, "#0E1E2D", 0.35) }}
                        >
                          {session.start} {session.language.toUpperCase()}
                        </Link>
                      ))
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                ))}
                <td className="px-4 py-2 text-center font-semibold tabular-nums">{row.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Box>
  );
}
