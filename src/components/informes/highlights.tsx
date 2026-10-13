import { Minus, TrendingDown, TrendingUp, Trophy } from "lucide-react";

import { CountUp } from "@/components/reservas/count-up";
import { formatCents } from "@/lib/domain/money";
import { roundToEuros, slotText, type Delta, type Heatmap, type PodiumEntry, type Report } from "@/lib/domain/reports";
import { cn } from "@/lib/utils";

const DELTA_CLASS: Record<Delta["direction"], string> = {
  up: "bg-ok-soft text-ok",
  down: "bg-danger-soft text-danger",
  flat: "bg-line-2 text-muted-foreground",
};

/** Etiqueta «+12 %» con flecha, frente al periodo anterior. */
export function DeltaBadge({ delta, className }: { delta: Delta | null; className?: string }) {
  if (!delta) return null;
  const Icon = delta.direction === "up" ? TrendingUp : delta.direction === "down" ? TrendingDown : Minus;
  return (
    <span
      title="Frente a los 30 días anteriores"
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[0.7rem] font-semibold whitespace-nowrap tabular-nums",
        DELTA_CLASS[delta.direction],
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3" />
      {delta.text}
      <span className="sr-only"> frente a los 30 días anteriores</span>
    </span>
  );
}

type Deltas = { revenue: Delta | null; pax: Delta | null; avgTicket: Delta | null; occupancy: Delta | null } | null;

/** Las cuatro cifras de arriba, que cuentan hasta su valor, con su variación si se compara. */
export function KpiStrip({ kpis, deltas }: { kpis: Report["kpis"]; deltas: Deltas }) {
  const items = [
    {
      label: "Ingresos",
      value: <CountUp value={roundToEuros(kpis.revenueCents)} format="cents" />,
      detail: kpis.bookings === 1 ? "1 reserva" : `${kpis.bookings} reservas`,
      delta: deltas?.revenue ?? null,
    },
    { label: "Pasajeros", value: <CountUp value={kpis.pax} />, detail: `${kpis.paxPerBooking} por reserva`, delta: deltas?.pax ?? null },
    {
      label: "Ticket medio",
      value: <CountUp value={roundToEuros(kpis.avgTicketCents)} format="cents" />,
      detail: "por reserva",
      delta: deltas?.avgTicket ?? null,
    },
    {
      label: "Ocupación",
      value: `${kpis.occupancyPercent}%`,
      detail: `${kpis.bookedSeats} de ${kpis.capacity} plazas`,
      delta: deltas?.occupancy ?? null,
    },
  ];
  return (
    // Como el prototipo: 2 columnas por debajo de 820 px, para que quepan importes largos.
    <dl className="grid grid-cols-2 overflow-hidden rounded-2xl border border-black/5 bg-surface shadow-card min-[820px]:grid-cols-4">
      {items.map(({ label, value, detail, delta }, index) => (
        <div
          key={label}
          className={cn(
            "min-w-0 px-3.5 py-3 tablet:px-[18px] tablet:py-3.5",
            index % 2 === 1 && "border-l border-line-2",
            index >= 2 && "border-t border-line-2 min-[820px]:border-t-0",
            index === 2 && "min-[820px]:border-l",
          )}
        >
          <dt className="text-[0.72rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">{label}</dt>
          <dd className="mt-[3px] text-[1.25rem] font-semibold tracking-[-0.03em] tabular-nums tablet:text-[1.6rem]">{value}</dd>
          <dd className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[0.76rem] text-muted-foreground">
            {detail}
            <DeltaBadge delta={delta} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

// Orden en el podio: 2.º, 1.º y 3.º, con alturas distintas.
const PODIUM_SLOTS = [
  { place: 2, height: "h-[64px]" },
  { place: 1, height: "h-[92px]" },
  { place: 3, height: "h-[46px]" },
] as const;

/** Lo más vendido: podio de los tres productos que más ingresan y el que más crece. */
export function Podium({
  podium,
  rising,
}: {
  podium: PodiumEntry[];
  rising: (PodiumEntry & { growthPercent: number }) | null;
}) {
  if (!podium.length) return <p className="m-0 text-muted-foreground">Sin ventas en este periodo</p>;
  return (
    <div className="flex flex-col gap-4">
      <ol aria-label="Productos que más ingresan" className="m-0 grid list-none grid-cols-3 items-end gap-2 p-0">
        {PODIUM_SLOTS.map(({ place, height }) => {
          const entry = podium[place - 1];
          if (!entry) return <li key={place} aria-hidden="true" />;
          return (
            <li key={place} className="flex min-w-0 flex-col items-center text-center">
              <span className="sr-only">{place}.º </span>
              <span className="line-clamp-2 min-h-[2.4em] text-[0.8rem] leading-tight font-semibold">{entry.name}</span>
              <span className="mt-0.5 text-[0.86rem] font-semibold tabular-nums">{formatCents(roundToEuros(entry.revenueCents))}</span>
              <DeltaBadge delta={entry.delta} className="mt-1" />
              <span
                aria-hidden="true"
                className={cn("podium-step mt-2 grid w-full place-items-start justify-center rounded-t-xl pt-2 text-white shadow-sm", height)}
                style={{ background: entry.color, animationDelay: `${(3 - place) * 90}ms` }}
              >
                <span className="grid size-7 place-items-center rounded-full bg-white/25 text-[0.85rem] font-bold">
                  {place === 1 ? <Trophy className="size-4" /> : place}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
      {rising ? (
        <p className="m-0 flex items-center gap-2 rounded-xl bg-ok-soft px-3 py-2 text-[0.84rem] text-ok">
          <TrendingUp aria-hidden="true" className="size-4 flex-none" />
          <span>
            <b className="font-semibold">El que más crece:</b> {rising.name}, {rising.growthPercent > 0 ? "+" : ""}
            {rising.growthPercent} % en ingresos.
          </span>
        </p>
      ) : null}
    </div>
  );
}

const LEVEL_CLASS = ["bg-line-2/70 text-faint", "bg-[#dcebfc] text-[#1d4f8a]", "bg-[#a8cdf5] text-[#123a66]", "bg-[#4f9bec] text-white", "bg-primary text-white"];

/** Cuándo se llenan las salidas: ocupación por día de la semana y hora. */
export function HeatmapGrid({ heatmap }: { heatmap: Heatmap }) {
  if (!heatmap.times.length) return <p className="m-0 text-muted-foreground">Sin salidas en este periodo</p>;
  return (
    <div className="flex flex-col gap-3">
      <div data-scroll-x className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-[3px] text-[0.72rem]">
          <caption className="sr-only">Ocupación por día de la semana y hora de salida</caption>
          <thead>
            <tr>
              <th scope="col" className="w-9">
                <span className="sr-only">Día</span>
              </th>
              {heatmap.times.map((time) => (
                <th key={time} scope="col" className="px-0.5 pb-0.5 font-medium text-muted-foreground tabular-nums">
                  {time}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {heatmap.rows.map((row) => (
              <tr key={row.weekday}>
                <th scope="row" className="pr-1 text-left font-medium text-muted-foreground">
                  <span aria-hidden="true">{row.label.slice(0, 3)}</span>
                  <span className="sr-only">{row.label}</span>
                </th>
                {row.cells.map((cell, index) => (
                  <td
                    key={cell.time}
                    title={
                      cell.occupancyPercent === null
                        ? `${row.label} ${cell.time}: sin salidas`
                        : `${row.label} ${cell.time}: ${cell.occupancyPercent} % · ${cell.sessions === 1 ? "1 salida" : `${cell.sessions} salidas`}`
                    }
                    className={cn(
                      "heat-cell h-8 min-w-11 rounded-md text-center font-semibold tabular-nums",
                      LEVEL_CLASS[cell.level],
                    )}
                    style={{ animationDelay: `${(row.weekday - 1) * 30 + index * 20}ms` }}
                  >
                    {cell.occupancyPercent === null ? <span className="sr-only">sin salidas</span> : `${cell.occupancyPercent}%`}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.78rem] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5" aria-hidden="true">
          Vacío
          {LEVEL_CLASS.slice(1).map((level) => (
            <span key={level} className={cn("size-3 rounded-[3px]", level)} />
          ))}
          Lleno
        </span>
        {heatmap.best && heatmap.worst ? (
          <span>
            Se llenan más <b className="font-semibold text-foreground">{slotText(heatmap.best)}</b> ({heatmap.best.occupancyPercent} %) y
            menos <b className="font-semibold text-foreground">{slotText(heatmap.worst)}</b> ({heatmap.worst.occupancyPercent} %).
          </span>
        ) : null}
      </div>
    </div>
  );
}
