import Link from "next/link";
import { ChevronRight, Plus, UserRound } from "lucide-react";

import { STATE_TEXT_CLASS, stateHint } from "@/components/salidas/session-state-style";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { sessionState } from "@/lib/domain/session-state";
import { sessionFlags } from "@/lib/domain/today";
import { cn } from "@/lib/utils";

import type { TodaySession } from "./types";

/** Fila de una salida en «Salidas del día» («slot» del prototipo). */
export function SessionRow({ session }: { session: TodaySession }) {
  const state = sessionState({ ...session, ended: session.past });
  const percent = session.capacity ? Math.min(100, (session.booked / session.capacity) * 100) : 0;
  const cancelled = session.status === "cancelled";
  const label = `${session.time} ${session.product.name}`;
  const labelId = `slot-${session.id}`;

  return (
    <li
      aria-labelledby={`${labelId}-time ${labelId}-name`}
      className={cn(
        // Toda la fila abre el manifiesto (enlace estirado en el nombre); «Reservar» queda por encima.
        "relative grid grid-cols-[58px_minmax(0,1fr)] items-center gap-3 border-b transition-colors hover:bg-surface-2 border-line-2 px-3.5 py-3 last:border-b-0",
        "tablet:grid-cols-[70px_minmax(0,1fr)_170px] tablet:gap-4 tablet:px-4 tablet:py-3.5",
        "desk:grid-cols-[76px_minmax(0,1fr)_220px_auto]",
        session.past && "opacity-60",
      )}
    >
      <div className="font-mono text-[1.05rem] leading-[1.1] font-medium">
        <span id={`${labelId}-time`}>{session.time}</span>
        <small className="mt-[3px] block text-[0.72rem] font-normal text-faint">→ {session.endTime}</small>
      </div>
      <div className="min-w-0">
        <div className={cn("flex items-center gap-2 font-semibold", cancelled && "text-muted-foreground line-through")}>
          <span aria-hidden="true" className="size-2.5 flex-none rounded-[3px]" style={{ background: session.product.color }} />
          <Link
            id={`${labelId}-name`}
            href={`/panel/salidas/${session.id}`}
            aria-label={`Manifiesto ${label}`}
            className="truncate outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:rounded-[inherit] focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
          >
            {session.product.name}
          </Link>
        </div>
        <div className="mt-[5px] flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[0.78rem] text-muted-foreground">
          <span className="rounded-[5px] border border-line px-1 font-mono text-[0.68rem]">{session.language.toUpperCase()}</span>
          {session.guides.length ? (
            <span className="flex min-w-0 items-center gap-1">
              <UserRound aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="sr-only">Guía:</span>
              <span className="truncate">{session.guides.join(", ")}</span>
            </span>
          ) : null}
          {sessionFlags(session).map((flag) => (
            <Pill key={flag.label} tone={flag.tone === "warn" ? "warn" : "neutral"} className={cn(flag.tone === "danger" && "bg-danger-soft text-danger")}>
              {flag.label}
            </Pill>
          ))}
        </div>
      </div>
      <div className="col-start-2 tablet:col-start-auto">
        <div className="flex justify-between gap-2 text-[0.78rem] text-muted-foreground">
          <span>
            <b className="font-semibold text-foreground tabular-nums">{session.booked}</b> / {session.capacity} plazas
          </span>
          <span className={STATE_TEXT_CLASS[state.tone]}>{state.label}</span>
        </div>
        <div
          role="progressbar"
          aria-label={`Ocupación ${label}`}
          aria-valuemin={0}
          aria-valuemax={session.capacity}
          aria-valuenow={Math.min(session.booked, session.capacity)}
          className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line-2"
        >
          <div className={cn("h-full rounded-full", state.free > 0 ? "bg-primary" : "bg-warn")} style={{ width: `${percent}%` }} />
        </div>
      </div>
      <div className="pointer-events-none relative z-10 col-start-2 flex items-center gap-1.5 tablet:col-span-2 desk:col-span-1 desk:col-start-auto">
        {state.panelBookable ? (
          <Button asChild variant="outline" size="sm" className="pointer-events-auto">
            <Link href={`/panel/reservas/nueva?salida=${session.id}`} aria-label={`Reservar ${label}`}>
              <Plus aria-hidden="true" />
              Reservar
            </Link>
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled
            aria-label={`Reservar ${label}`}
            title={stateHint(state)}
          >
            <Plus aria-hidden="true" />
            Reservar
          </Button>
        )}
        <span aria-hidden="true" className="pointer-events-none ml-auto flex items-center gap-1 text-[0.8rem] font-medium text-primary">
          Ver pasajeros
          <ChevronRight className="size-4" />
        </span>
      </div>
    </li>
  );
}
