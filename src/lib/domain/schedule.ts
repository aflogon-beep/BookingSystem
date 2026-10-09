import { TZDate } from "@date-fns/tz";
import { addDays, format, getISODay, parseISO } from "date-fns";
import { es } from "date-fns/locale";

/** Zona horaria del negocio: las reglas de horario guardan horas locales de aquí. */
export const BUSINESS_TIMEZONE = "Atlantic/Canary";

/** Iniciales de los días ISO (1 = lunes), como en el prototipo. */
export const WEEKDAY_INITIALS = ["L", "M", "X", "J", "V", "S", "D"] as const;
export const WEEKDAY_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;
export const WEEKDAY_NAMES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"] as const;

/**
 * Convierte lo que se escribe en «Horas de salida» («9:00, 17:30») en horas HH:MM
 * válidas, sin repetir y ordenadas. Ignora lo que no sea una hora.
 */
export function parseTimes(raw: string): string[] {
  const times = raw
    .split(/[,;\s]+/)
    .filter((part) => /^\d{1,2}:\d{2}$/.test(part))
    .map((part) => {
      const [hours = "", minutes = ""] = part.split(":");
      return `${hours.padStart(2, "0")}:${minutes}`;
    })
    .filter((time) => Number(time.slice(0, 2)) < 24 && Number(time.slice(3)) < 60);
  return [...new Set(times)].sort();
}

/** Resumen de días de una regla: «Todos los días», «Lun–Vie», «Mar, Jue»… */
export function daysLabel(weekdays: readonly number[]): string {
  const sorted = [...new Set(weekdays)].filter((day) => day >= 1 && day <= 7).sort((a, b) => a - b);
  const key = sorted.join(",");
  if (key === "1,2,3,4,5,6,7") return "Todos los días";
  if (key === "1,2,3,4,5") return "Lun–Vie";
  if (key === "1,2,3,4,5,6") return "Lun–Sáb";
  if (key === "6,7") return "Fines de semana";
  return sorted.map((day) => WEEKDAY_SHORT[day - 1]).join(", ");
}

/** Fecha de hoy (YYYY-MM-DD) en la zona horaria del negocio. */
export function businessToday(now: Date = new Date()): string {
  return format(new TZDate(now, BUSINESS_TIMEZONE), "yyyy-MM-dd");
}

export type RuleForPreview = {
  weekdays: readonly number[];
  times: readonly string[];
  language: string;
  validFrom: string | null;
  validTo: string | null;
};

export type PreviewSession = { date: string; time: string; language: string };

/**
 * Salidas que generarían las reglas en los `days` días que empiezan en `from` (YYYY-MM-DD,
 * incluido). Fecha y hora son locales del negocio: es solo una vista previa, la conversión a
 * timestamptz la hace generate_sessions (tarea 1.4). Si dos reglas coinciden en fecha y hora,
 * cuenta una sola salida (como el prototipo y unique(product_id, starts_at)).
 */
export function previewSessions(rules: readonly RuleForPreview[], from: string, days: number): PreviewSession[] {
  const start = parseISO(from);
  const sessions = new Map<string, PreviewSession>();
  for (let offset = 0; offset < days; offset++) {
    const day = addDays(start, offset);
    const date = format(day, "yyyy-MM-dd");
    const weekday = getISODay(day);
    for (const rule of rules) {
      if (!rule.weekdays.includes(weekday)) continue;
      if (rule.validFrom && date < rule.validFrom) continue;
      if (rule.validTo && date > rule.validTo) continue;
      for (const time of rule.times) {
        const key = `${date} ${time}`;
        if (!sessions.has(key)) sessions.set(key, { date, time, language: rule.language });
      }
    }
  }
  return [...sessions.values()].sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)));
}

/** «2026-10-12» → «12 oct», como las salidas de la vista previa del prototipo. */
export function shortDateLabel(date: string): string {
  return format(parseISO(date), "d MMM", { locale: es }).replace(".", "");
}
