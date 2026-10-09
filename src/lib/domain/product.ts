import { z } from "zod";

import { parseTimes } from "@/lib/domain/schedule";

/** Colores de producto del prototipo. */
export const PRODUCT_COLORS = ["#0A84FF", "#FF9F0A", "#30B158", "#AF52DE", "#FF375F", "#40A8C4", "#A2845E"] as const;

/** Límites de la tabla products (supabase/migrations/…_catalog.sql). */
export const PRODUCT_LIMITS = {
  name: 120,
  description: 4000,
  meetingPoint: 200,
  place: 200,
  duration: { min: 15, max: 1440 },
  capacity: { min: 1, max: 500 },
} as const;

/** Fotos de producto: bucket público de Storage, solo imágenes y como mucho 5 MB. */
export const PRODUCT_PHOTO_BUCKET = "product-photos";
export const PRODUCT_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PRODUCT_PHOTO_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export const PRODUCT_PHOTO_PATH = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;

export function photoExtension(mimeType: string): string | null {
  return Object.hasOwn(PRODUCT_PHOTO_TYPES, mimeType)
    ? PRODUCT_PHOTO_TYPES[mimeType as keyof typeof PRODUCT_PHOTO_TYPES]
    : null;
}

/** «Ruta de los volcanes» → «ruta-de-los-volcanes». Sin acentos ni símbolos, máximo 80 caracteres. */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ñ/g, "n")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return slug || "tour";
}

/** Primer slug libre: «teide», «teide-2», «teide-3»… */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, 80 - suffix.length).replace(/-+$/g, "")}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Precio escrito en euros («45», «45,5», «45,50», «45.50») → céntimos. null si no es un
 * importe válido. Nunca usa coma flotante: separa euros y céntimos como texto.
 */
export function parsePriceInput(raw: string): number | null {
  const match = /^(\d{1,6})(?:[.,](\d{1,2}))?$/.exec(raw.trim());
  if (!match) return null;
  const euros = Number(match[1]);
  const cents = Number((match[2] ?? "").padEnd(2, "0"));
  return euros * 100 + cents;
}

/** Céntimos → texto para el campo de precio: 4550 → «45,50», 4500 → «45». */
export function formatPriceInput(cents: number): string {
  const euros = Math.trunc(cents / 100);
  const rest = cents % 100;
  return rest === 0 ? String(euros) : `${euros},${String(rest).padStart(2, "0")}`;
}

/** 300 → «5 h», 270 → «4 h 30 min», 45 → «45 min». */
export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return `${Math.floor(minutes / 60)} h${rest ? ` ${rest} min` : ""}`;
}

/** Precio «desde»: el menor precio mayor que cero (las entradas gratis no cuentan). 0 si no hay. */
export function minPrice(prices: readonly { priceCents: number }[]): number {
  const paid = prices.map((price) => price.priceCents).filter((cents) => cents > 0);
  return paid.length ? Math.min(...paid) : 0;
}

const isoDate = z.iso.date({ error: "Fecha no válida." });

const ruleSchema = z
  .object({
    weekdays: z
      .array(z.number().int().min(1).max(7))
      .min(1, { error: "Cada regla necesita al menos un día." })
      .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
    times: z
      .array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "Hora no válida." }))
      .min(1, { error: "Cada regla necesita al menos una hora de salida, por ejemplo 10:00." })
      .transform((times) => parseTimes(times.join(","))),
    language: z.string().regex(/^[a-z]{2}$/, { error: "Idioma no válido." }),
    validFrom: isoDate.nullable(),
    validTo: isoDate.nullable(),
  })
  .refine((rule) => !rule.validFrom || !rule.validTo || rule.validTo >= rule.validFrom, {
    error: "En una regla, «Hasta» no puede ser anterior a «Desde».",
  });

const intIn = (min: number, max: number, label: string) =>
  z
    .number({ error: `${label}: escribe un número.` })
    .int({ error: `${label}: escribe un número entero.` })
    .min(min, { error: `${label}: mínimo ${min}.` })
    .max(max, { error: `${label}: máximo ${max}.` });

/** Producto tal y como lo envía el editor. Las pestañas a las que lleva cada error están en `tab`. */
export const productInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { error: "Ponle nombre al producto." })
      .max(PRODUCT_LIMITS.name, { error: `El nombre admite ${PRODUCT_LIMITS.name} caracteres como máximo.` }),
    description: z
      .string()
      .trim()
      .max(PRODUCT_LIMITS.description, { error: "La descripción es demasiado larga." }),
    meetingPoint: z
      .string()
      .trim()
      .max(PRODUCT_LIMITS.meetingPoint, { error: "El punto de encuentro es demasiado largo." }),
    place: z.string().trim().max(PRODUCT_LIMITS.place, { error: "La zona del recorrido es demasiado larga." }),
    // En inglés, para la web /en (opcionales: vacíos, la web muestra el español).
    nameEn: z
      .string()
      .trim()
      .max(PRODUCT_LIMITS.name, { error: `El nombre en inglés admite ${PRODUCT_LIMITS.name} caracteres como máximo.` })
      .optional()
      .default(""),
    descriptionEn: z
      .string()
      .trim()
      .max(PRODUCT_LIMITS.description, { error: "La descripción en inglés es demasiado larga." })
      .optional()
      .default(""),
    meetingPointEn: z
      .string()
      .trim()
      .max(PRODUCT_LIMITS.meetingPoint, { error: "El punto de encuentro en inglés es demasiado largo." })
      .optional()
      .default(""),
    durationMin: intIn(PRODUCT_LIMITS.duration.min, PRODUCT_LIMITS.duration.max, "Duración"),
    capacity: intIn(PRODUCT_LIMITS.capacity.min, PRODUCT_LIMITS.capacity.max, "Aforo por salida"),
    minPax: intIn(1, PRODUCT_LIMITS.capacity.max, "Mínimo para salir"),
    pickup: z.boolean(),
    color: z.enum(PRODUCT_COLORS, { error: "Color no válido." }),
    photoPath: z.string().regex(PRODUCT_PHOTO_PATH, { error: "Foto no válida." }).nullable(),
    active: z.boolean(),
    prices: z
      .array(z.object({ ticketTypeId: z.uuid(), priceCents: z.number().int().min(0).max(100_000_000) }))
      .min(1, { error: "Activa al menos un tipo de entrada." })
      .refine((prices) => new Set(prices.map((price) => price.ticketTypeId)).size === prices.length, {
        error: "Hay un tipo de entrada repetido.",
      }),
    rules: z.array(ruleSchema).max(50, { error: "Demasiadas reglas de horario." }),
  })
  .refine((product) => product.minPax <= product.capacity, {
    error: "El mínimo para salir no puede ser mayor que el aforo.",
    path: ["minPax"],
  });

export type ProductInput = z.input<typeof productInputSchema>;
export type ProductData = z.output<typeof productInputSchema>;

export type ProductTab = "general" | "precios" | "horarios";

/** Pestaña del editor donde está el campo con error, para llevar ahí al usuario. */
export function tabForIssue(path: readonly PropertyKey[]): ProductTab {
  const field = path[0];
  if (field === "prices") return "precios";
  if (field === "rules") return "horarios";
  return "general";
}

type Parsed = { ok: true; value: ProductData } | { ok: false; error: string; tab: ProductTab };

/**
 * Valida el producto del editor. Además de la forma, comprueba que los idiomas de las reglas
 * sean del negocio y que los tipos de entrada existan.
 */
export function parseProductInput(
  input: unknown,
  context: { languages: readonly string[]; ticketTypeIds: readonly string[] },
): Parsed {
  const result = productInputSchema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    return { ok: false, error: issue?.message ?? "Datos no válidos.", tab: tabForIssue(issue?.path ?? []) };
  }
  const product = result.data;
  if (product.rules.some((rule) => !context.languages.includes(rule.language))) {
    return { ok: false, error: "Hay una regla en un idioma que no está en Ajustes.", tab: "horarios" };
  }
  if (product.prices.some((price) => !context.ticketTypeIds.includes(price.ticketTypeId))) {
    return { ok: false, error: "Hay un tipo de entrada que ya no existe. Recarga la página.", tab: "precios" };
  }
  return { ok: true, value: product };
}

/** URL pública de una foto del bucket de productos. */
export function productPhotoUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${PRODUCT_PHOTO_BUCKET}/${path}`;
}
