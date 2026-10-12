/**
 * «Línea del día» de la pantalla Hoy: dónde cae cada salida en una franja horaria, en qué carril
 * (las que coinciden en hora van una debajo de otra), cuál es la próxima y cuánto falta.
 * Las horas son de Canarias en formato «HH:mm».
 */

export type TimelineSession = {
  id: string;
  time: string;
  endTime: string;
  status: string;
  capacity: number;
  booked: number;
};

export type TimelineWindow = { start: number; end: number };

/** Franja si el día no tiene salidas. */
const DEFAULT_WINDOW: TimelineWindow = { start: 8 * 60, end: 20 * 60 };
/** La franja nunca es más corta que esto (una sola salida no ocupa todo el ancho). */
const MIN_SPAN = 6 * 60;
const DAY = 24 * 60;

export function minutesOf(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

/** Inicio y fin en minutos desde las 00:00. Si termina pasada la medianoche, el fin pasa de 24 h. */
export function sessionSpan(session: Pick<TimelineSession, "time" | "endTime">): { start: number; end: number } {
  const start = minutesOf(session.time);
  let end = minutesOf(session.endTime);
  if (end <= start) end += DAY;
  return { start, end };
}

/** Horas enteras que abarcan todas las salidas, con un mínimo de 6 h centradas en ellas. */
export function timelineWindow(sessions: readonly Pick<TimelineSession, "time" | "endTime">[]): TimelineWindow {
  if (!sessions.length) return DEFAULT_WINDOW;
  const spans = sessions.map(sessionSpan);
  let start = Math.floor(Math.min(...spans.map((span) => span.start)) / 60) * 60;
  let end = Math.ceil(Math.max(...spans.map((span) => span.end)) / 60) * 60;
  if (end - start < MIN_SPAN) {
    const extra = MIN_SPAN - (end - start);
    start = Math.max(0, start - Math.floor(extra / 120) * 60);
    end = start + Math.max(MIN_SPAN, end - start);
  }
  return { start, end };
}

/** Posición (0–100 %) de un minuto del día dentro de la franja, sin salirse de ella. */
export function timelinePercent(minute: number, window: TimelineWindow): number {
  const percent = ((minute - window.start) / (window.end - window.start)) * 100;
  return Math.min(100, Math.max(0, percent));
}

/** Marcas de hora: cada 1, 2 o 3 h para que no haya más de siete. */
export function timelineTicks(window: TimelineWindow): number[] {
  const hours = (window.end - window.start) / 60;
  const step = Math.max(1, Math.ceil(hours / 6)) * 60;
  const ticks: number[] = [];
  for (let minute = window.start; minute <= window.end; minute += step) ticks.push(minute);
  return ticks;
}

/** «08:00» (y «01:00» para las horas pasada la medianoche). */
export function tickLabel(minute: number): string {
  const hours = Math.floor(minute / 60) % 24;
  return `${String(hours).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

/**
 * Carril de cada salida: la primera libre cuando empieza (por orden de hora). Dos salidas
 * que se solapan nunca comparten carril.
 */
export function timelineLanes(sessions: readonly TimelineSession[]): { lanes: Map<string, number>; count: number } {
  const ordered = [...sessions].sort((a, b) => sessionSpan(a).start - sessionSpan(b).start || a.id.localeCompare(b.id));
  const laneEnds: number[] = [];
  const lanes = new Map<string, number>();
  for (const session of ordered) {
    const { start, end } = sessionSpan(session);
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = end;
    lanes.set(session.id, lane);
  }
  return { lanes, count: laneEnds.length };
}

export type DayMoment<T extends TimelineSession> = {
  /** Salidas que están en marcha ahora mismo. */
  live: T[];
  /** La siguiente en salir (no cancelada) y los minutos que faltan. */
  next: { session: T; minutesUntil: number } | null;
};

/** Qué está pasando a esta hora (en minutos desde las 00:00 del día que se mira). */
export function dayMoment<T extends TimelineSession>(sessions: readonly T[], nowMinute: number): DayMoment<T> {
  const active = sessions.filter((session) => session.status !== "cancelled");
  const live = active.filter((session) => {
    const { start, end } = sessionSpan(session);
    return start <= nowMinute && nowMinute < end;
  });
  const upcoming = active
    .filter((session) => sessionSpan(session).start > nowMinute)
    .sort((a, b) => sessionSpan(a).start - sessionSpan(b).start);
  const first = upcoming[0];
  return { live, next: first ? { session: first, minutesUntil: sessionSpan(first).start - nowMinute } : null };
}

/** Parte recorrida de una salida en marcha (0–100). */
export function sessionProgress(session: Pick<TimelineSession, "time" | "endTime">, nowMinute: number): number {
  const { start, end } = sessionSpan(session);
  return Math.round(Math.min(1, Math.max(0, (nowMinute - start) / (end - start))) * 100);
}

/** «en 5 min», «en 1 h», «en 2 h 05 min». */
export function countdownText(minutes: number): string {
  if (minutes <= 0) return "ahora";
  if (minutes < 60) return `en ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `en ${hours} h ${String(rest).padStart(2, "0")} min` : `en ${hours} h`;
}

/** Saludo según la hora de Canarias. */
export function greeting(hour: number): string {
  if (hour >= 6 && hour < 14) return "Buenos días";
  if (hour >= 14 && hour < 21) return "Buenas tardes";
  return "Buenas noches";
}

/** Primer nombre para el saludo («Alberto» de «Alberto Flores»). */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

export type DayStory = { sessions: number; pax: number; checkedIn: number };

/** Frase resumen del día: «Hoy salen 4 tours con 38 pasajeros. Ya han llegado 12.» */
export function dayStory(kind: "Hoy" | "Día pasado" | "Próximamente", story: DayStory): string {
  const tours = `${story.sessions} ${story.sessions === 1 ? "tour" : "tours"}`;
  const pax = `${story.pax} ${story.pax === 1 ? "pasajero" : "pasajeros"}`;
  if (!story.sessions) return kind === "Día pasado" ? "Este día no hubo salidas." : "No hay salidas programadas este día.";
  if (kind === "Día pasado") return `Salieron ${tours} con ${pax}; se presentaron ${story.checkedIn}.`;
  if (kind === "Próximamente") return `${story.sessions === 1 ? "Sale" : "Salen"} ${tours} con ${pax} reservados.`;
  const base = `Hoy ${story.sessions === 1 ? "sale" : "salen"} ${tours} con ${pax}.`;
  if (!story.pax) return base;
  if (story.checkedIn >= story.pax) return `${base} Ya han llegado todos.`;
  return story.checkedIn ? `${base} Ya ${story.checkedIn === 1 ? "ha llegado 1" : `han llegado ${story.checkedIn}`}.` : base;
}
