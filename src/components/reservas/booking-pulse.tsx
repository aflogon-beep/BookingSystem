import Link from "next/link";

import { CountUp } from "@/components/reservas/count-up";
import { PAGE_SIZE, bookingListHref, type BookingListParams } from "@/lib/domain/booking-list";
import {
  barPercent,
  collectedPercent,
  dayGroupLabel,
  isPulseDaySelected,
  pulseAxisLabel,
  pulseDayParams,
  type Pulse,
} from "@/lib/domain/booking-pulse";
import { formatCents } from "@/lib/domain/money";
import { shortDateLabel } from "@/lib/domain/schedule";
import { cn } from "@/lib/utils";

type Summary = { bookings: number; pax: number; totalCents: number; collectedCents: number };

/**
 * Cabecera de Reservas: cifras que cuentan hasta su valor, anillo de lo cobrado y el «pulso» de dos
 * semanas (pasajeros por día y producto). Pulsar un día filtra el listado a ese día.
 */
export function BookingPulse({
  params,
  summary,
  pulse,
  today,
}: {
  params: BookingListParams;
  summary: Summary;
  pulse: Pulse | null;
  today: string;
}) {
  return (
    <section
      aria-label="Resumen de las reservas"
      className="grid rounded-2xl border border-black/5 bg-surface shadow-card desk:grid-cols-[minmax(0,1fr)_380px]"
    >
      {pulse ? <PulseChart params={params} pulse={pulse} today={today} /> : null}
      <Figures summary={summary} className={cn(pulse && "max-desk:order-first max-desk:border-b desk:border-l")} />
    </section>
  );
}

function Figures({ summary, className }: { summary: Summary; className?: string }) {
  const percent = collectedPercent(summary.collectedCents, summary.totalCents);
  const pendingCents = Math.max(0, summary.totalCents - summary.collectedCents);
  const items = [
    { label: "Reservas", value: <CountUp value={summary.bookings} /> },
    { label: "Pasajeros", value: <CountUp value={summary.pax} /> },
    { label: "Importe", value: <CountUp value={summary.totalCents} format="cents" /> },
  ];
  return (
    <dl className={cn("grid grid-cols-2 border-line-2", className)}>
      {items.map((item, index) => (
        <div
          key={item.label}
          className={cn("min-w-0 px-3.5 py-3 tablet:px-[18px] tablet:py-3.5", index % 2 === 1 && "border-l border-line-2", index >= 2 && "border-t border-line-2")}
        >
          <dt className="text-[0.72rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">{item.label}</dt>
          <dd className="mt-[3px] truncate text-[1.25rem] font-semibold tracking-[-0.03em] tablet:text-[1.5rem]">{item.value}</dd>
        </div>
      ))}
      <div className="grid min-w-0 grid-cols-[52px_minmax(0,1fr)] content-center items-center gap-x-2.5 border-t border-l border-line-2 px-3.5 py-3 tablet:px-[18px] tablet:py-3.5">
        <dt className="col-start-2 row-start-1 self-end text-[0.72rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Cobrado</dt>
        <CollectedRing percent={percent} />
        <dd className="col-start-2 row-start-2 self-start text-[0.76rem] text-muted-foreground">
          {pendingCents ? (
            <span className="font-semibold text-warn">Faltan {formatCents(pendingCents)}</span>
          ) : summary.totalCents ? (
            <span className="font-semibold text-ok">Todo cobrado</span>
          ) : (
            "Nada que cobrar"
          )}
        </dd>
      </div>
    </dl>
  );
}

/** Anillo con el porcentaje cobrado; se dibuja al cargar. */
function CollectedRing({ percent }: { percent: number }) {
  const done = percent >= 100;
  return (
    <dd className="relative col-start-1 row-span-2 row-start-1 grid size-[52px] place-items-center">
      <svg viewBox="0 0 36 36" aria-hidden="true" className="absolute inset-0 -rotate-90">
        <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="4" className="stroke-line-2" />
        <circle
          cx="18"
          cy="18"
          r="15.5"
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="100"
          style={{ strokeDashoffset: 100 - percent }}
          className={cn("pulse-ring", done ? "stroke-ok" : "stroke-primary", percent === 0 && "opacity-0")}
        />
      </svg>
      <span className="text-[0.78rem] font-semibold tracking-[-0.02em]">
        <CountUp value={percent} format="percent" />
      </span>
    </dd>
  );
}

function PulseChart({ params, pulse, today }: { params: BookingListParams; pulse: Pulse; today: string }) {
  const first = pulse.days[0]?.date ?? today;
  const last = pulse.days[pulse.days.length - 1]?.date ?? today;
  const title = first === today ? "Próximos 14 días" : last === today ? "Últimos 14 días" : `Del ${shortDateLabel(first)} al ${shortDateLabel(last)}`;
  const busiest = pulse.busiest ? pulse.days.find((day) => day.date === pulse.busiest) : null;
  return (
    <div className="min-w-0 px-3.5 pt-3 pb-2.5 tablet:px-[18px] tablet:pt-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h2 className="text-[0.98rem] font-semibold">{title}</h2>
        <p className="text-[0.78rem] text-muted-foreground">
          {pulse.totalPax ? (
            <>
              {pulse.totalPax} {pulse.totalPax === 1 ? "pasajero" : "pasajeros"}
              {busiest ? (
                <>
                  {" "}
                  · Día más fuerte: <span className="font-semibold text-foreground first-letter:uppercase">{dayGroupLabel(busiest.date, today).title}</span> ({busiest.pax})
                </>
              ) : null}
            </>
          ) : (
            "Sin pasajeros en estos días"
          )}
        </p>
      </div>

      <ol aria-label="Pasajeros por día" className="mt-3 grid grid-cols-14 items-end gap-[3px] tablet:gap-1.5">
        {pulse.days.map((day, index) => {
          const selected = isPulseDaySelected(params, day.date, today);
          const isToday = day.date === today;
          const axis = pulseAxisLabel(day.date);
          const label = dayGroupLabel(day.date, today);
          const description = `${label.title}${label.detail ? `, ${label.detail}` : ""}: ${day.pax} ${day.pax === 1 ? "pasajero" : "pasajeros"}, ${day.bookings} ${day.bookings === 1 ? "reserva" : "reservas"}`;
          return (
            <li key={day.date} className="min-w-0">
              <Link
                href={bookingListHref({ ...pulseDayParams(params, day.date, today), limit: PAGE_SIZE })}
                scroll={false}
                aria-label={selected ? `${description}. Quitar el filtro de este día` : `${description}. Ver solo este día`}
                aria-current={selected ? "date" : undefined}
                className={cn(
                  "group relative flex flex-col items-center gap-1 rounded-lg pt-1 pb-0.5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  selected ? "bg-primary-soft" : "hover:bg-surface-2",
                )}
              >
                <span className={cn("text-[0.66rem] font-semibold tabular-nums tablet:text-[0.72rem]", day.pax ? "text-foreground" : "text-transparent")}>{day.pax}</span>
                <span className="flex h-[84px] w-full items-end justify-center tablet:h-[112px]">
                  <span
                    className="pulse-bar flex w-full max-w-[34px] flex-col-reverse overflow-hidden rounded-t-[5px] rounded-b-[2px]"
                    style={{ height: `${barPercent(day.pax, pulse.maxPax)}%`, animationDelay: `${index * 35}ms` }}
                  >
                    {day.segments.map((segment) => (
                      <span
                        key={segment.name}
                        className="block w-full flex-none border-t border-white/60 first:border-t-0"
                        style={{ height: `${(segment.pax / day.pax) * 100}%`, background: segment.color }}
                      />
                    ))}
                  </span>
                </span>
                <span
                  className={cn(
                    "flex w-full flex-col items-center rounded-md py-0.5 leading-tight",
                    isToday ? "bg-primary text-white" : selected ? "text-primary-dark" : "text-muted-foreground",
                  )}
                >
                  <span className="text-[0.6rem] font-semibold tracking-[0.04em]">{axis.weekday}</span>
                  <span className="text-[0.74rem] font-semibold tabular-nums">{axis.dayOfMonth}</span>
                </span>
                {/* Detalle al pasar el ratón (en táctil, el día se pulsa directamente). */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none absolute bottom-full z-10 mb-1 hidden w-max max-w-[220px] rounded-lg bg-foreground px-2.5 py-1.5 text-left text-[0.74rem] text-background shadow-lg group-hover:block",
                    index < 3 ? "left-0" : index > pulse.days.length - 4 ? "right-0" : "left-1/2 -translate-x-1/2",
                  )}
                >
                  <b className="block first-letter:uppercase">{label.detail ? `${label.title} · ${label.detail}` : label.title}</b>
                  {day.pax ? (
                    <>
                      {day.pax} {day.pax === 1 ? "pasajero" : "pasajeros"} · {day.bookings} {day.bookings === 1 ? "reserva" : "reservas"}
                      {day.segments.map((segment) => (
                        <span key={segment.name} className="mt-0.5 flex items-center gap-1.5">
                          <span className="size-2 flex-none rounded-[2px]" style={{ background: segment.color }} />
                          <span className="truncate">{segment.name}</span>
                          <span className="ml-auto pl-2 tabular-nums">{segment.pax}</span>
                        </span>
                      ))}
                    </>
                  ) : (
                    "Sin reservas"
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>

      {pulse.legend.length ? (
        <ul aria-label="Productos" className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.74rem] text-muted-foreground">
          {pulse.legend.slice(0, 8).map((product) => (
            <li key={product.name} className="flex min-w-0 items-center gap-1.5">
              <span aria-hidden="true" className="size-2.5 flex-none rounded-[3px]" style={{ background: product.color }} />
              <span className="max-w-[180px] truncate">{product.name}</span>
            </li>
          ))}
          {pulse.legend.length > 8 ? <li>y {pulse.legend.length - 8} más</li> : null}
        </ul>
      ) : null}
    </div>
  );
}
