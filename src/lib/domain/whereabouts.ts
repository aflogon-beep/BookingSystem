import { toBusinessDateTime } from "@/lib/domain/calendar";

/** Salida de un día tal y como la usa Equipo · Dónde están. */
export type DaySession = {
  id: string;
  productName: string;
  color: string;
  /** Zona del recorrido; si no hay, el punto de encuentro o el nombre del producto. */
  place: string;
  meetingPoint: string;
  language: string;
  startsAt: string;
  endsAt: string;
  /** Hora de salida y de vuelta, en la hora del negocio. */
  start: string;
  end: string;
  booked: number;
  missing: number;
  resourceIds: string[];
};

export type StatusLevel = "live" | "soon" | "free" | "idle" | "done";

export type ResourceStatus = {
  level: StatusLevel;
  title: string;
  sub: string;
  /** Salidas del recurso ese día, por hora. */
  sessions: DaySession[];
  /** La salida en la que va ahora mismo (solo hoy). */
  currentId: string | null;
};

/** Lugar que se enseña para una salida: zona, punto de encuentro o producto. */
export function sessionPlace(product: { name: string; place: string; meetingPoint: string }): string {
  return product.place.trim() || product.meetingPoint.trim() || product.name;
}

const sessionsLabel = (count: number) => `${count} ${count === 1 ? "salida" : "salidas"}`;

/**
 * Dónde está un recurso: en ruta, sale pronto, libre hasta su próxima salida, jornada terminada…
 * Solo «hoy» mira la hora; otro día solo dice cuántas salidas tiene y cuándo es la primera.
 */
export function resourceStatus(resourceId: string, sessions: readonly DaySession[], isToday: boolean, now: Date): ResourceStatus {
  const mine = sessions
    .filter((session) => session.resourceIds.includes(resourceId))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const base = { sessions: mine, currentId: null };
  const first = mine[0];
  if (!first) return { ...base, level: "idle", title: "Libre todo el día", sub: "Sin salidas asignadas" };
  if (!isToday) {
    return { ...base, level: "idle", title: sessionsLabel(mine.length), sub: `Primera a las ${first.start} · ${first.place}` };
  }

  const current = mine.find((session) => new Date(session.startsAt) <= now && new Date(session.endsAt) > now);
  if (current) {
    return {
      ...base,
      currentId: current.id,
      level: "live",
      title: `En ruta · ${current.place}`,
      sub: `${current.productName} · vuelve a las ${current.end}`,
    };
  }
  const next = mine.find((session) => new Date(session.startsAt) > now);
  if (next) {
    const minutes = Math.round((new Date(next.startsAt).getTime() - now.getTime()) / 60_000);
    const sub = [next.productName, next.language.toUpperCase(), next.meetingPoint].filter(Boolean).join(" · ");
    return minutes <= 60
      ? { ...base, level: "soon", title: `Sale en ${minutes} min`, sub }
      : { ...base, level: "free", title: `Libre · próxima a las ${next.start}`, sub };
  }
  return { ...base, level: "done", title: "Jornada terminada", sub: `${sessionsLabel(mine.length)} hoy` };
}

/** Minutos desde las 00:00 del día (hora del negocio); 0 antes del día y 24 h después. */
export function minutesInDay(instant: string, day: string): number {
  const { date, time } = toBusinessDateTime(instant);
  if (date < day) return 0;
  if (date > day) return 24 * 60;
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/** Horas que abarca la línea de tiempo: de 8 a 22 como mínimo, ampliadas a las salidas del día. */
export function timelineHours(sessions: readonly DaySession[], day: string): { from: number; to: number } {
  let from = 8;
  let to = 22;
  for (const session of sessions) {
    from = Math.min(from, Math.floor(minutesInDay(session.startsAt, day) / 60));
    to = Math.max(to, Math.ceil(minutesInDay(session.endsAt, day) / 60));
  }
  return { from, to: Math.min(Math.max(to, from + 1), 24) };
}

/** Posición (0–100 %) de unos minutos del día en la línea de tiempo. */
export function timelinePercent(minutes: number, hours: { from: number; to: number }): number {
  const span = (hours.to - hours.from) * 60;
  return Math.max(0, Math.min(100, ((minutes - hours.from * 60) / span) * 100));
}

/** Una salida ya terminada (hoy se enseña más clara). */
export function isPast(session: DaySession, now: Date): boolean {
  return new Date(session.endsAt) <= now;
}

export type WhereaboutsKpis = { live: number; soon: number; available: number; total: number; withoutEquipment: number };

/** Indicadores de la cabecera: en ruta, salen en menos de 1 h, disponibles y salidas con reservas sin equipo. */
export function whereaboutsKpis(statuses: readonly ResourceStatus[], sessions: readonly DaySession[]): WhereaboutsKpis {
  const count = (levels: StatusLevel[]) => statuses.filter((status) => levels.includes(status.level)).length;
  return {
    live: count(["live"]),
    soon: count(["soon"]),
    available: count(["free", "idle", "done"]),
    total: statuses.length,
    withoutEquipment: sessions.filter((session) => session.booked > 0 && session.missing > 0).length,
  };
}

/** Aviso tras «Asignar pendientes»: aviso (no error) si quedan huecos, porque algo sí se asignó. */
export function assignPendingMessage(result: { sessions: number; missing: number }): { level: "ok" | "warn"; text: string } {
  if (!result.sessions) return { level: "ok", text: "No había salidas pendientes" };
  if (result.missing) {
    return {
      level: "warn",
      text: `Asignado. ${result.missing === 1 ? "Falta 1 recurso libre" : `Faltan ${result.missing} recursos libres`} o con ese idioma`,
    };
  }
  return { level: "ok", text: `${result.sessions === 1 ? "1 salida" : `${result.sessions} salidas`} con equipo asignado` };
}

/** Salida de la semana para la planificación de guías. */
export type PlanSession = { id: string; date: string; start: string; language: string; productName: string; color: string; resourceIds: string[] };

/** Planificación semanal: por guía, sus salidas de cada día (por hora) y el total. */
export function weeklyPlan<R extends { id: string }>(
  guides: readonly R[],
  sessions: readonly PlanSession[],
  days: readonly string[],
): { guide: R; days: PlanSession[][]; total: number }[] {
  const sorted = [...sessions].sort((a, b) => (a.date === b.date ? a.start.localeCompare(b.start) : a.date.localeCompare(b.date)));
  return guides.map((guide) => {
    const perDay = days.map((day) => sorted.filter((session) => session.date === day && session.resourceIds.includes(guide.id)));
    return { guide, days: perDay, total: perDay.reduce((sum, list) => sum + list.length, 0) };
  });
}
