"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, UserRound } from "lucide-react";

import { toBusinessDateTime } from "@/lib/domain/calendar";
import {
  countdownText,
  dayMoment,
  dayStory,
  type DayMoment,
  firstName,
  greeting,
  minutesOf,
  sessionProgress,
  sessionSpan,
  tickLabel,
  timelineLanes,
  timelinePercent,
  timelineTicks,
  timelineWindow,
} from "@/lib/domain/day-timeline";
import { cn } from "@/lib/utils";

import type { TodaySession } from "./types";

type DayKind = "Hoy" | "Día pasado" | "Próximamente";

/** El reloj avanza solo: la cuenta atrás y la línea «ahora» se mueven sin recargar. */
const TICK_MS = 20_000;

function useNow(initial: string): Date {
  const [now, setNow] = useState(() => new Date(initial));
  useEffect(() => {
    // La hora del servidor puede llevar un rato (caché del navegador): se pone al día enseguida.
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
 * Cabecera de Hoy: saludo, el día contado en una frase, anillo de llegadas, la próxima salida con
 * cuenta atrás en vivo y la «línea del día» con cada salida en su hora y la marca de ahora.
 */
export function DayHero({
  sessions,
  kind,
  staffName,
  pax,
  checkedIn,
  initialNow,
}: {
  sessions: TodaySession[];
  kind: DayKind;
  staffName: string;
  pax: number;
  checkedIn: number;
  initialNow: string;
}) {
  const now = useNow(initialNow);
  const clock = toBusinessDateTime(now.toISOString()).time;
  // Minuto del día que se mira: hoy, la hora real; un día pasado ya acabó; uno futuro aún no empieza.
  const nowMinute = kind === "Hoy" ? minutesOf(clock) : kind === "Día pasado" ? Number.POSITIVE_INFINITY : -1;
  const live = sessions.filter((session) => session.status !== "cancelled");
  const moment = dayMoment(sessions, nowMinute);
  const name = firstName(staffName);
  const eyebrow =
    kind === "Hoy" ? `${greeting(Number(clock.slice(0, 2)))}${name ? `, ${name}` : ""}` : kind === "Día pasado" ? "Así fue el día" : "Así viene el día";

  return (
    <section
      aria-label="El día de un vistazo"
      className="day-hero relative overflow-hidden rounded-2xl border border-black/5 bg-surface shadow-card"
    >
      <div className="flex items-center gap-4 px-4 pt-4 tablet:px-5 tablet:pt-5">
        <div className="min-w-0 flex-1">
          <p className="text-[0.78rem] font-semibold text-primary">{eyebrow}</p>
          <p className="mt-0.5 text-[1.02rem] leading-snug font-semibold tracking-[-0.01em] text-balance tablet:text-[1.25rem]">
            {dayStory(kind, { sessions: live.length, pax, checkedIn })}
          </p>
        </div>
        {pax > 0 && kind !== "Próximamente" ? <ArrivalRing pax={pax} checkedIn={checkedIn} /> : null}
      </div>

      <Spotlight kind={kind} moment={moment} nowMinute={nowMinute} first={live[0]} />

      <Timeline sessions={sessions} nowMinute={kind === "Hoy" ? nowMinute : null} clock={clock} />
    </section>
  );
}

function ArrivalRing({ pax, checkedIn }: { pax: number; checkedIn: number }) {
  const percent = Math.min(100, Math.round((checkedIn / pax) * 100));
  return (
    <div
      role="img"
      aria-label={`Han llegado ${checkedIn} de ${pax} pasajeros`}
      className="relative grid size-[62px] flex-none place-items-center tablet:size-[74px]"
    >
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3.5" className="stroke-line-2" />
        <circle
          cx="18"
          cy="18"
          r="15.5"
          fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="100"
          strokeDashoffset={100 - percent}
          className={cn("pulse-ring", percent >= 100 ? "stroke-ok" : "stroke-primary")}
        />
      </svg>
      <span className="text-center leading-none">
        <b className="block text-[0.95rem] font-semibold tabular-nums tablet:text-[1.1rem]">{percent}%</b>
        <span className="text-[0.62rem] text-muted-foreground">llegados</span>
      </span>
    </div>
  );
}

function sessionLabel(session: TodaySession) {
  return `${session.product.name} a las ${session.time}: ${session.booked} de ${session.capacity} plazas`;
}

function Spotlight({
  kind,
  moment,
  nowMinute,
  first,
}: {
  kind: DayKind;
  moment: DayMoment<TodaySession>;
  nowMinute: number;
  first: TodaySession | undefined;
}) {
  const target = kind === "Hoy" ? moment.next?.session : kind === "Próximamente" ? first : undefined;
  if (!target && !moment.live.length) return null;

  return (
    <div className="mt-3.5 flex flex-col gap-2 px-4 tablet:flex-row tablet:px-5">
      {target ? (
        <Link
          href={`/panel/salidas/${target.id}`}
          aria-label={`${kind === "Hoy" ? "Próxima salida" : "Primera salida"}: ${sessionLabel(target)}`}
          className="group relative flex min-w-0 flex-1 items-center gap-3 overflow-hidden rounded-xl border border-black/5 bg-surface-2 py-2.5 pr-3 pl-4 transition-colors hover:bg-primary-soft focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5" style={{ background: target.product.color }} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[0.7rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
              {kind === "Hoy" ? (
                <span aria-hidden="true" className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:animate-none" />
                  <span className="relative inline-flex size-2 rounded-full bg-primary" />
                </span>
              ) : null}
              {kind === "Hoy" ? "Próxima salida" : "Primera salida"}
            </p>
            <p className="mt-0.5 truncate font-semibold">
              <span className="font-mono">{target.time}</span> · {target.product.name}
            </p>
            <p className="mt-0.5 flex min-w-0 items-center gap-2 text-[0.78rem] text-muted-foreground">
              <span className="whitespace-nowrap tabular-nums">
                {target.booked}/{target.capacity} plazas
              </span>
              {target.guides.length ? (
                <span className="flex min-w-0 items-center gap-1">
                  <UserRound aria-hidden="true" className="size-3.5 shrink-0" />
                  <span className="truncate">{target.guides.join(", ")}</span>
                </span>
              ) : null}
            </p>
          </div>
          {kind === "Hoy" && moment.next ? (
            <span className="flex-none text-right text-[1.05rem] font-semibold tracking-[-0.02em] text-primary tabular-nums tablet:text-[1.3rem]">
              {countdownText(moment.next.minutesUntil)}
            </span>
          ) : null}
          <ChevronRight aria-hidden="true" className="size-4 flex-none text-faint transition-transform group-hover:translate-x-0.5" />
        </Link>
      ) : null}

      {moment.live.length ? (
        <ul aria-label="En marcha" className="flex min-w-0 flex-col gap-2 tablet:max-w-[46%] tablet:flex-1">
          {moment.live.slice(0, 2).map((session) => {
            const progress = sessionProgress(session, nowMinute);
            return (
              <li key={session.id} className="min-w-0">
                <Link
                  href={`/panel/salidas/${session.id}`}
                  aria-label={`En marcha: ${sessionLabel(session)}`}
                  className="block rounded-xl border border-ok/20 bg-ok-soft px-3 py-2 transition-colors hover:border-ok/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <p className="flex items-center justify-between gap-2 text-[0.78rem]">
                    <span className="min-w-0 truncate">
                      <b className="font-semibold text-ok">En marcha</b> · {session.product.name}
                    </span>
                    <span className="flex-none text-muted-foreground tabular-nums">hasta {session.endTime}</span>
                  </p>
                  <span aria-hidden="true" className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-white/70">
                    <span className="block h-full rounded-full bg-ok transition-[width] duration-700" style={{ width: `${progress}%` }} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function Timeline({ sessions, nowMinute, clock }: { sessions: TodaySession[]; nowMinute: number | null; clock: string }) {
  const range = timelineWindow(sessions);
  const ticks = timelineTicks(range);
  const { lanes, count } = timelineLanes(sessions);
  const showNow = nowMinute !== null && nowMinute >= range.start && nowMinute <= range.end;
  const nowPercent = showNow ? timelinePercent(nowMinute, range) : 0;
  const laneCount = Math.max(1, count);

  return (
    <div className="px-4 pt-4 pb-3.5 tablet:px-5 tablet:pb-4">
      <p className="mb-2 text-[0.7rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Línea del día</p>
      <div className="relative">
        <ul
          aria-label="Línea del día"
          className="relative rounded-lg bg-surface-2"
          style={{ height: `calc(${laneCount} * var(--lane) + ${laneCount + 1} * 6px)`, ["--lane" as string]: "30px" }}
        >
          {/* Rejilla de horas. */}
          {ticks.map((minute) => (
            <span
              key={minute}
              aria-hidden="true"
              className="absolute inset-y-0 w-px bg-line-2"
              style={{ left: `${timelinePercent(minute, range)}%` }}
            />
          ))}
          {sessions.map((session, index) => {
            const span = sessionSpan(session);
            const left = timelinePercent(span.start, range);
            const width = Math.max(2.5, timelinePercent(span.end, range) - left);
            const fill = session.capacity ? Math.min(100, (session.booked / session.capacity) * 100) : 0;
            const cancelled = session.status === "cancelled";
            const past = nowMinute === null ? false : span.end <= nowMinute;
            const running = nowMinute !== null && span.start <= nowMinute && nowMinute < span.end && !cancelled;
            return (
              <li
                key={session.id}
                className="absolute"
                style={{
                  left: `${Math.min(left, 100 - width)}%`,
                  width: `${width}%`,
                  top: `calc(${lanes.get(session.id) ?? 0} * (var(--lane) + 6px) + 6px)`,
                  height: "var(--lane)",
                }}
              >
                <Link
                  href={`/panel/salidas/${session.id}`}
                  aria-label={`${sessionLabel(session)}${cancelled ? " (cancelada)" : ""}`}
                  title={`${session.time}–${session.endTime} · ${session.product.name} · ${session.booked}/${session.capacity} plazas`}
                  className={cn(
                    "timeline-block relative flex h-full items-center overflow-hidden rounded-md border-l-[3px] pr-1.5 pl-1.5 text-[0.7rem] leading-none text-ellipsis whitespace-nowrap transition-[filter,transform] hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    past && "opacity-45",
                    cancelled && "timeline-cancelled text-muted-foreground line-through",
                    running && "ring-2 ring-ok/60 ring-offset-1 ring-offset-surface-2",
                  )}
                  style={{
                    borderLeftColor: session.product.color,
                    background: cancelled ? undefined : `color-mix(in srgb, ${session.product.color} 18%, var(--surface))`,
                    animationDelay: `${Math.min(index, 12) * 55}ms`,
                  }}
                >
                  {cancelled ? null : (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 bottom-0 h-[3px]"
                      style={{ background: `linear-gradient(90deg, ${session.product.color} ${fill}%, transparent ${fill}%)` }}
                    />
                  )}
                  <span className="relative overflow-hidden text-ellipsis">
                    <b className="font-semibold tabular-nums">{session.time}</b>
                    <span className="max-tablet:hidden"> {session.product.name}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        {showNow ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 rounded-full bg-danger transition-[left] duration-700"
            style={{ left: `${nowPercent}%` }}
          >
            <span className="absolute -top-1 left-1/2 size-2.5 -translate-x-1/2 rounded-full bg-danger ring-2 ring-surface" />
          </div>
        ) : null}
      </div>
      <div aria-hidden="true" className="relative mt-1.5 h-4 text-[0.66rem] text-faint tabular-nums">
        {ticks.map((minute) => {
          const left = timelinePercent(minute, range);
          // La pastilla de «ahora» tapa las horas que tiene al lado.
          if (showNow && Math.abs(left - nowPercent) < 16) return null;
          return (
            <span
              key={minute}
              className={cn("absolute top-0", left === 0 ? "" : left === 100 ? "-translate-x-full" : "-translate-x-1/2")}
              style={{ left: `${left}%` }}
            >
              {tickLabel(minute)}
            </span>
          );
        })}
        {showNow ? (
          <span
            className={cn(
              "absolute -top-px rounded-full bg-danger px-1.5 py-px font-semibold text-white",
              nowPercent < 12 ? "" : nowPercent > 88 ? "-translate-x-full" : "-translate-x-1/2",
            )}
            style={{ left: `${nowPercent}%` }}
          >
            {clock}
          </span>
        ) : null}
      </div>
    </div>
  );
}
