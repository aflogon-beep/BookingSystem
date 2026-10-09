import { z } from "zod";

import { LANGUAGE_CODES, isLanguageCode, type LanguageCode } from "@/lib/domain/settings";

/** Tipos de recurso, en el orden de las pestañas de Equipo. */
export const RESOURCE_TYPES = ["guide", "vehicle", "equipment"] as const;

export type ResourceType = (typeof RESOURCE_TYPES)[number];

export function isResourceType(value: unknown): value is ResourceType {
  return typeof value === "string" && (RESOURCE_TYPES as readonly string[]).includes(value);
}

/** Textos de cada tipo: pestaña y URL (?tipo=), botón «Añadir…», nombre de uno nuevo y campo numérico. */
export const RESOURCE_TYPE_TEXT: Record<
  ResourceType,
  { singular: string; plural: string; slug: string; newName: string; seatsLabel: string | null }
> = {
  guide: { singular: "guía", plural: "Guías", slug: "guias", newName: "Nuevo guía", seatsLabel: null },
  vehicle: { singular: "vehículo", plural: "Vehículos", slug: "vehiculos", newName: "Nuevo vehículo", seatsLabel: "Asientos" },
  equipment: { singular: "equipo", plural: "Equipos", slug: "equipos", newName: "Nuevo equipo", seatsLabel: "Unidades" },
};

/** Pestaña de Equipo a partir de ?tipo= (guías por defecto). */
export function resourceTypeFromSlug(slug: string | string[] | undefined): ResourceType {
  const value = Array.isArray(slug) ? slug[0] : slug;
  return RESOURCE_TYPES.find((type) => RESOURCE_TYPE_TEXT[type].slug === value) ?? "guide";
}

/** Límites de las tablas resources y product_needs (supabase/migrations/…_resources.sql). */
export const RESOURCE_LIMITS = { name: 120, seats: { min: 1, max: 100 }, need: { min: 0, max: 5 } } as const;

/** Asientos o unidades de un recurso nuevo: los del prototipo (furgoneta de 8, un telescopio). */
export const DEFAULT_SEATS: Record<ResourceType, number> = { guide: 1, vehicle: 8, equipment: 1 };

const resourceFieldSchemas = {
  name: z
    .string()
    .trim()
    .min(1, { error: "El nombre no puede quedar vacío." })
    .max(RESOURCE_LIMITS.name, { error: `El nombre admite ${RESOURCE_LIMITS.name} caracteres como máximo.` }),
  seats: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.coerce
      .number({ error: "Escribe un número." })
      .int({ error: "Escribe un número entero." })
      .min(RESOURCE_LIMITS.seats.min, { error: `Mínimo ${RESOURCE_LIMITS.seats.min}.` })
      .max(RESOURCE_LIMITS.seats.max, { error: `Máximo ${RESOURCE_LIMITS.seats.max}.` }),
  ),
};

export type ResourceField = keyof typeof resourceFieldSchemas;
export type ResourceValue<F extends ResourceField> = z.infer<(typeof resourceFieldSchemas)[F]>;

export function isResourceField(value: string): value is ResourceField {
  return Object.hasOwn(resourceFieldSchemas, value);
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** Valida un campo de la ficha de un recurso tal y como llega del panel. */
export function parseResourceField<F extends ResourceField>(field: F, raw: unknown): Parsed<ResourceValue<F>> {
  const result = resourceFieldSchemas[field].safeParse(raw);
  if (!result.success) return { ok: false, error: result.error.issues[0]?.message ?? "Valor no válido." };
  return { ok: true, value: result.data as ResourceValue<F> };
}

/**
 * Activa o desactiva un idioma de un guía. Devuelve los idiomas en el orden de Ajustes y descarta
 * códigos desconocidos. Puede quedarse sin ninguno (entonces no se le asignará ninguna salida).
 */
export function toggleGuideLanguage(current: readonly string[], language: LanguageCode): LanguageCode[] {
  const active = new Set(current.filter(isLanguageCode));
  if (active.has(language)) active.delete(language);
  else active.add(language);
  return LANGUAGE_CODES.filter((code) => active.has(code));
}

/** Iniciales para el avatar de un guía: «Ana Pérez» → «AP», «Lukas» → «L». */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toLocaleUpperCase("es") ?? "")
    .join("");
}

/** «0 salidas esta semana», «1 salida esta semana». */
export function weeklySessionsLabel(count: number): string {
  return `${count} ${count === 1 ? "salida" : "salidas"} esta semana`;
}

/** Cuenta cuántas salidas tiene asignadas cada recurso. */
export function countByResource(rows: readonly { resource_id: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.resource_id, (counts.get(row.resource_id) ?? 0) + 1);
  return counts;
}

/** Lo que necesita cada salida de un producto: cuántos recursos de cada tipo (0 a 5). */
export type ProductNeeds = Record<ResourceType, number>;

/** Un producto nuevo necesita un guía (como en el prototipo). */
export const DEFAULT_NEEDS: ProductNeeds = { guide: 1, vehicle: 0, equipment: 0 };

const needCount = (label: string) =>
  z
    .number({ error: `${label}: escribe un número.` })
    .int({ error: `${label}: escribe un número entero.` })
    .min(RESOURCE_LIMITS.need.min, { error: `${label}: mínimo ${RESOURCE_LIMITS.need.min}.` })
    .max(RESOURCE_LIMITS.need.max, { error: `${label}: máximo ${RESOURCE_LIMITS.need.max}.` });

export const productNeedsSchema = z.object({
  guide: needCount("Guías"),
  vehicle: needCount("Vehículos"),
  equipment: needCount("Equipos"),
});

/** Filas de product_needs → necesidades del editor (los tipos sin fila son 0). */
export function needsFromRows(rows: readonly { resource_type: string; qty: number }[]): ProductNeeds {
  const needs: ProductNeeds = { guide: 0, vehicle: 0, equipment: 0 };
  for (const row of rows) if (isResourceType(row.resource_type)) needs[row.resource_type] = row.qty;
  return needs;
}
