import { z } from "zod";

import type { Locale } from "./i18n";
import { localizedText } from "./i18n";

/**
 * Ficha web del producto (estilo GetYourGuide / Bókun): galería, frase corta, lo más destacado,
 * itinerario, incluye / no incluye, qué llevar, información importante y dificultad. Todo
 * opcional; lo que esté vacío no se muestra en la web. Límites de
 * supabase/migrations/…_product_page.sql.
 */
export const PRODUCT_PAGE_LIMITS = {
  tagline: 160,
  goodToKnow: 2000,
  listItem: 200,
  highlights: 12,
  list: 15,
  stops: 20,
  stopTitle: 120,
  stopDescription: 1000,
  /** Fotos en total, portada incluida. */
  photos: 12,
} as const;

export const DIFFICULTIES = ["easy", "moderate", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const DIFFICULTY_TEXT: Record<Locale, Record<Difficulty, string>> = {
  es: { easy: "Fácil", moderate: "Moderada", hard: "Exigente" },
  en: { easy: "Easy", moderate: "Moderate", hard: "Challenging" },
};

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === "string" && (DIFFICULTIES as readonly string[]).includes(value);
}

/** Texto de un cuadro «una por línea» → lista sin líneas vacías ni espacios sobrantes. */
export function linesToList(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-•*·]\s*/, "").trim())
    .filter(Boolean);
}

export function listToLines(list: readonly string[]): string {
  return list.join("\n");
}

const list = (max: number, label: string) =>
  z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(PRODUCT_PAGE_LIMITS.listItem, {
          error: `${label}: cada línea admite ${PRODUCT_PAGE_LIMITS.listItem} caracteres como máximo.`,
        }),
    )
    .max(max, { error: `${label}: como mucho ${max} líneas.` });

const text = (max: number, error: string) => z.string().trim().max(max, { error });

export const productContentSchema = z.object({
  tagline: text(PRODUCT_PAGE_LIMITS.tagline, `La frase corta admite ${PRODUCT_PAGE_LIMITS.tagline} caracteres como máximo.`),
  taglineEn: text(PRODUCT_PAGE_LIMITS.tagline, `La frase corta en inglés admite ${PRODUCT_PAGE_LIMITS.tagline} caracteres como máximo.`),
  highlights: list(PRODUCT_PAGE_LIMITS.highlights, "Lo más destacado"),
  highlightsEn: list(PRODUCT_PAGE_LIMITS.highlights, "Lo más destacado en inglés"),
  included: list(PRODUCT_PAGE_LIMITS.list, "Incluye"),
  includedEn: list(PRODUCT_PAGE_LIMITS.list, "Incluye en inglés"),
  notIncluded: list(PRODUCT_PAGE_LIMITS.list, "No incluye"),
  notIncludedEn: list(PRODUCT_PAGE_LIMITS.list, "No incluye en inglés"),
  bring: list(PRODUCT_PAGE_LIMITS.list, "Qué llevar"),
  bringEn: list(PRODUCT_PAGE_LIMITS.list, "Qué llevar en inglés"),
  goodToKnow: text(PRODUCT_PAGE_LIMITS.goodToKnow, "La información importante es demasiado larga."),
  goodToKnowEn: text(PRODUCT_PAGE_LIMITS.goodToKnow, "La información importante en inglés es demasiado larga."),
  difficulty: z.enum(DIFFICULTIES, { error: "Dificultad no válida." }).nullable(),
});

export type ProductContent = z.output<typeof productContentSchema>;

export const EMPTY_CONTENT: ProductContent = {
  tagline: "",
  taglineEn: "",
  highlights: [],
  highlightsEn: [],
  included: [],
  includedEn: [],
  notIncluded: [],
  notIncludedEn: [],
  bring: [],
  bringEn: [],
  goodToKnow: "",
  goodToKnowEn: "",
  difficulty: null,
};

export const productStopSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, { error: "Cada parada del itinerario necesita un título." })
    .max(PRODUCT_PAGE_LIMITS.stopTitle, { error: `El título de una parada admite ${PRODUCT_PAGE_LIMITS.stopTitle} caracteres como máximo.` }),
  titleEn: text(PRODUCT_PAGE_LIMITS.stopTitle, `El título en inglés de una parada admite ${PRODUCT_PAGE_LIMITS.stopTitle} caracteres como máximo.`),
  description: text(PRODUCT_PAGE_LIMITS.stopDescription, "La descripción de una parada es demasiado larga."),
  descriptionEn: text(PRODUCT_PAGE_LIMITS.stopDescription, "La descripción en inglés de una parada es demasiado larga."),
  durationMin: z
    .number({ error: "Duración de la parada: escribe un número de minutos." })
    .int({ error: "Duración de la parada: escribe un número entero." })
    .min(1, { error: "Duración de la parada: mínimo 1 minuto." })
    .max(1440, { error: "Duración de la parada: máximo 1440 minutos." })
    .nullable(),
});

export type ProductStop = z.output<typeof productStopSchema>;

export const productStopsSchema = z
  .array(productStopSchema)
  .max(PRODUCT_PAGE_LIMITS.stops, { error: `El itinerario admite ${PRODUCT_PAGE_LIMITS.stops} paradas como máximo.` });

/** Argumentos de save_product para la ficha web (p_product->'content'). */
export function contentToRpc(content: ProductContent) {
  return {
    tagline: content.tagline,
    tagline_en: content.taglineEn,
    highlights: content.highlights,
    highlights_en: content.highlightsEn,
    included: content.included,
    included_en: content.includedEn,
    not_included: content.notIncluded,
    not_included_en: content.notIncludedEn,
    bring: content.bring,
    bring_en: content.bringEn,
    good_to_know: content.goodToKnow,
    good_to_know_en: content.goodToKnowEn,
    difficulty: content.difficulty,
  };
}

export function stopsToRpc(stops: readonly ProductStop[]) {
  return stops.map((stop) => ({
    title: stop.title,
    title_en: stop.titleEn,
    description: stop.description,
    description_en: stop.descriptionEn,
    duration_min: stop.durationMin,
  }));
}

type ContentRow = {
  tagline: string;
  tagline_en: string;
  highlights: string[];
  highlights_en: string[];
  included: string[];
  included_en: string[];
  not_included: string[];
  not_included_en: string[];
  bring: string[];
  bring_en: string[];
  good_to_know: string;
  good_to_know_en: string;
  difficulty: string | null;
};

/** Fila de products → ficha web. */
export function contentFromRow(row: ContentRow): ProductContent {
  return {
    tagline: row.tagline,
    taglineEn: row.tagline_en,
    highlights: row.highlights,
    highlightsEn: row.highlights_en,
    included: row.included,
    includedEn: row.included_en,
    notIncluded: row.not_included,
    notIncludedEn: row.not_included_en,
    bring: row.bring,
    bringEn: row.bring_en,
    goodToKnow: row.good_to_know,
    goodToKnowEn: row.good_to_know_en,
    difficulty: isDifficulty(row.difficulty) ? row.difficulty : null,
  };
}

type StopRow = {
  position: number;
  title: string;
  title_en: string;
  description: string;
  description_en: string;
  duration_min: number | null;
};

export function stopsFromRows(rows: readonly StopRow[]): ProductStop[] {
  return rows
    .toSorted((a, b) => a.position - b.position)
    .map((row) => ({
      title: row.title,
      titleEn: row.title_en,
      description: row.description,
      descriptionEn: row.description_en,
      durationMin: row.duration_min,
    }));
}

/** Portada + galería ordenada → todas las fotos, la portada primero. */
export function photosFromRows(cover: string | null, gallery: readonly { path: string; position: number }[]): string[] {
  const rest = gallery.toSorted((a, b) => a.position - b.position).map((photo) => photo.path);
  return cover ? [cover, ...rest.filter((path) => path !== cover)] : rest;
}

/** Lista en el idioma de la web: la inglesa si tiene algo; si no, la española. */
export function localizedList(locale: Locale, es: readonly string[], en: readonly string[]): string[] {
  return locale === "en" && en.length ? [...en] : [...es];
}

export type WebStop = { title: string; description: string; durationMin: number | null };

export type WebContent = {
  tagline: string;
  highlights: string[];
  included: string[];
  notIncluded: string[];
  bring: string[];
  goodToKnow: string;
  difficulty: Difficulty | null;
  stops: WebStop[];
};

/** Ficha web en un idioma: lo que falta en inglés se ve en español. */
export function localizeContent(locale: Locale, content: ProductContent, stops: readonly ProductStop[]): WebContent {
  return {
    tagline: localizedText(locale, content.tagline, content.taglineEn),
    highlights: localizedList(locale, content.highlights, content.highlightsEn),
    included: localizedList(locale, content.included, content.includedEn),
    notIncluded: localizedList(locale, content.notIncluded, content.notIncludedEn),
    bring: localizedList(locale, content.bring, content.bringEn),
    goodToKnow: localizedText(locale, content.goodToKnow, content.goodToKnowEn),
    difficulty: content.difficulty,
    stops: stops.map((stop) => ({
      title: localizedText(locale, stop.title, stop.titleEn),
      description: localizedText(locale, stop.description, stop.descriptionEn),
      durationMin: stop.durationMin,
    })),
  };
}

/** Enlace a Google Maps para buscar el punto de encuentro. */
export function mapsUrl(place: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.trim())}`;
}

/** Mueve un elemento de posición (en la galería, la primera foto es la portada). Fuera de rango, la lista no cambia. */
export function moveItem<T>(photos: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= photos.length || to >= photos.length) return [...photos];
  const next = [...photos];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved as T);
  return next;
}

/** Fotos que estaban guardadas y ya no se usan: se borran de Storage después de guardar. */
export function unusedPhotos(previous: readonly string[], next: readonly (string | null)[]): string[] {
  const kept = new Set(next.filter((path): path is string => !!path));
  return [...new Set(previous)].filter((path) => !kept.has(path));
}

/** Secciones de la ficha web que tienen contenido, en el orden en que se muestran. */
export type PageSection = "highlights" | "description" | "itinerary" | "included" | "meeting" | "bring" | "goodToKnow";

export function pageSections(content: WebContent, description: string, meetingPoint: string): PageSection[] {
  const sections: PageSection[] = [];
  if (content.highlights.length) sections.push("highlights");
  if (description.trim()) sections.push("description");
  if (content.stops.length) sections.push("itinerary");
  if (content.included.length || content.notIncluded.length) sections.push("included");
  if (meetingPoint.trim()) sections.push("meeting");
  if (content.bring.length) sections.push("bring");
  if (content.goodToKnow.trim()) sections.push("goodToKnow");
  return sections;
}
