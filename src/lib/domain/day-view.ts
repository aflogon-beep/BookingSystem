/**
 * Vista «Día» del calendario: cada salida como un bloque en una columna de horas, alto según lo
 * que dura y en su carril si coincide con otras (como Google Calendar). Horas de Canarias «HH:mm».
 */

import { sessionSpan, timelineLanes, timelineWindow, type TimelineWindow } from "@/lib/domain/day-timeline";

/** Alto de una hora en la columna. */
export const HOUR_PX = 72;
/** Alto mínimo de un bloque, para que quepan la hora y el nombre aunque dure poco. */
export const MIN_BLOCK_PX = 84;

export type DaySession = { id: string; time: string; endTime: string; status: string; capacity: number; booked: number };

export type DayBlock = { top: number; height: number; lane: number; lanes: number };

/** Franja de horas del día y la posición de cada salida en ella. */
export function dayLayout(sessions: readonly DaySession[]): { window: TimelineWindow; height: number; blocks: Map<string, DayBlock> } {
  const window = timelineWindow(sessions);
  const { lanes, count } = timelineLanes(sessions);
  const blocks = new Map<string, DayBlock>();
  for (const session of sessions) {
    const { start, end } = sessionSpan(session);
    blocks.set(session.id, {
      top: minuteOffset(start, window),
      height: Math.max(MIN_BLOCK_PX, ((end - start) / 60) * HOUR_PX),
      lane: lanes.get(session.id) ?? 0,
      lanes: Math.max(1, count),
    });
  }
  return { window, height: ((window.end - window.start) / 60) * HOUR_PX, blocks };
}

/** Distancia en px desde el principio de la franja. */
export function minuteOffset(minute: number, window: TimelineWindow): number {
  return ((minute - window.start) / 60) * HOUR_PX;
}

/** Horas en punto de la franja (para las líneas y etiquetas de la izquierda). */
export function hourMarks(window: TimelineWindow): number[] {
  const marks: number[] = [];
  for (let minute = window.start; minute <= window.end; minute += 60) marks.push(minute);
  return marks;
}

/** Cifras del día: salidas que se hacen, plazas vendidas, aforo y ocupación. Sin las canceladas. */
export function daySummary(sessions: readonly { status: string; booked: number; capacity: number; unstaffed?: boolean }[]): {
  sessions: number;
  booked: number;
  capacity: number;
  percent: number;
  unstaffed: number;
} {
  const live = sessions.filter((session) => session.status !== "cancelled");
  const booked = live.reduce((sum, session) => sum + session.booked, 0);
  const capacity = live.reduce((sum, session) => sum + session.capacity, 0);
  return {
    sessions: live.length,
    booked,
    capacity,
    percent: capacity ? Math.round((booked / capacity) * 100) : 0,
    unstaffed: live.filter((session) => session.unstaffed && session.booked > 0).length,
  };
}

/** La línea de «ahora» solo se pinta si cae dentro de la franja. */
export function nowOffset(nowMinute: number, window: TimelineWindow): number | null {
  if (nowMinute < window.start || nowMinute > window.end) return null;
  return minuteOffset(nowMinute, window);
}
