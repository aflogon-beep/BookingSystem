"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock, HandCoins, Route } from "lucide-react";

import { countdownText } from "@/lib/domain/day-timeline";
import { allAboard, boardingText, departureText, guideMoment } from "@/lib/domain/guide-sheet";
import { formatCents } from "@/lib/domain/money";
import { cn } from "@/lib/utils";

/** El reloj avanza solo: la cuenta atrás se mueve sin recargar. */
const TICK_MS = 20_000;
const CONFETTI_MS = 2600;
const CONFETTI_COLORS = ["#0071e3", "#34c759", "#ff9f0a", "#ff375f", "#5e5ce6", "#64d2ff"];

function useNow(initial: string): Date {
  const [now, setNow] = useState(() => new Date(initial));
  useEffect(() => {
    const first = setTimeout(() => setNow(new Date()), 0);
    const timer = setInterval(() => setNow(new Date()), TICK_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);
  return now;
}

/**
 * Cabecera de la hoja del guía: anillo de pasajeros a bordo, cuánto falta para salir (o cuánto queda
 * de ruta), lo que hay que cobrar y, cuando llega el último, «¡Todos a bordo!» con confeti.
 */
export function GuideHero({
  startsAt,
  endsAt,
  initialNow,
  cancelled,
  pax,
  checkedIn,
  noShows,
  groups,
  dueCents,
  dueGroups,
}: {
  startsAt: string;
  endsAt: string;
  initialNow: string;
  cancelled: boolean;
  pax: number;
  checkedIn: number;
  noShows: number;
  groups: number;
  dueCents: number;
  dueGroups: number;
}) {
  const now = useNow(initialNow);
  const moment = guideMoment(startsAt, endsAt, now);
  const summary = { pax, checkedIn, noShows };
  const aboard = allAboard(summary);
  const celebration = useCelebration(aboard);

  return (
    <div className={cn("guide-hero relative overflow-hidden border-b border-line-2 px-4 py-4 tablet:px-5", aboard && "guide-hero-done")}>
      {celebration ? <Confetti key={celebration} /> : null}
      <div className="flex items-center gap-4">
        <BoardingRing pax={pax} checkedIn={checkedIn} done={aboard} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[0.78rem] font-semibold text-primary [&_svg]:size-3.5">
            {cancelled ? (
              <span className="text-danger">Salida cancelada</span>
            ) : moment.kind === "before" ? (
              <>
                <Clock aria-hidden="true" />
                {departureText(moment.minutesUntil)}
              </>
            ) : moment.kind === "running" ? (
              <>
                <Route aria-hidden="true" />
                En ruta · termina {countdownText(moment.minutesLeft)}
              </>
            ) : (
              <span className="text-muted-foreground">Salida terminada</span>
            )}
          </p>
          <p
            aria-live="polite"
            className={cn(
              "mt-0.5 text-[1.15rem] leading-tight font-semibold tracking-[-0.02em] text-balance tablet:text-[1.4rem]",
              aboard && "text-ok",
            )}
          >
            {boardingText(summary)}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[0.76rem] font-semibold">
            <span className="rounded-full bg-line-2 px-2 py-0.5 text-muted-foreground">
              {groups === 1 ? "1 grupo" : `${groups} grupos`} · {pax} pax
            </span>
            {dueCents > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 text-warn">
                <HandCoins aria-hidden="true" className="size-3.5" />
                Cobrar {formatCents(dueCents)} · {dueGroups === 1 ? "1 grupo" : `${dueGroups} grupos`}
              </span>
            ) : pax > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-ok-soft px-2 py-0.5 text-ok">
                <CheckCircle2 aria-hidden="true" className="size-3.5" />
                Nada que cobrar
              </span>
            ) : null}
          </div>
        </div>
      </div>
      {moment.kind === "running" && !cancelled ? (
        <div
          role="progressbar"
          aria-label="Avance de la ruta"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={moment.progress}
          className="mt-3.5 h-1.5 overflow-hidden rounded-full bg-line-2"
        >
          <span className="block h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${moment.progress}%` }} />
        </div>
      ) : null}
    </div>
  );
}

/** Lanza el confeti cuando se pasa a «todos a bordo» con la página abierta (no al cargarla ya así). */
function useCelebration(aboard: boolean): number {
  const previous = useRef(aboard);
  const [celebration, setCelebration] = useState(0);
  useEffect(() => {
    const was = previous.current;
    previous.current = aboard;
    if (!aboard || was) return;
    const start = setTimeout(() => setCelebration(Date.now()), 0);
    const stop = setTimeout(() => setCelebration(0), CONFETTI_MS);
    return () => {
      clearTimeout(start);
      clearTimeout(stop);
    };
  }, [aboard]);
  return celebration;
}

function BoardingRing({ pax, checkedIn, done }: { pax: number; checkedIn: number; done: boolean }) {
  const percent = pax ? Math.min(100, Math.round((checkedIn / pax) * 100)) : 0;
  return (
    <div
      role="img"
      aria-label={`A bordo ${checkedIn} de ${pax} pasajeros`}
      className={cn("relative grid size-[76px] flex-none place-items-center tablet:size-[88px]", done && "guide-ring-done")}
    >
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3" className="stroke-line-2" />
        <circle
          cx="18"
          cy="18"
          r="15.5"
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="100"
          strokeDashoffset={100 - percent}
          className={cn("pulse-ring", done ? "stroke-ok" : "stroke-primary")}
        />
      </svg>
      <span className="text-center leading-none">
        <b className="block text-[1.15rem] font-semibold tracking-[-0.03em] tabular-nums tablet:text-[1.35rem]">
          {checkedIn}
          <span className="text-[0.75em] text-faint">/{pax}</span>
        </b>
        <span className="text-[0.64rem] text-muted-foreground">a bordo</span>
      </span>
    </div>
  );
}

/** Confeti de CSS: unas piezas que caen desde arriba de la cabecera. Sin librerías. */
function Confetti() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {Array.from({ length: 28 }, (_, index) => (
        <span
          key={index}
          className="confetti-piece"
          style={{
            left: `${(index * 37) % 100}%`,
            background: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
            animationDelay: `${(index % 7) * 70}ms`,
            animationDuration: `${1500 + ((index * 53) % 900)}ms`,
            ["--drift" as string]: `${((index * 29) % 80) - 40}px`,
            ["--spin" as string]: `${360 + ((index * 47) % 540)}deg`,
          }}
        />
      ))}
    </div>
  );
}
