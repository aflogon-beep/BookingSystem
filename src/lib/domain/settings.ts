import { z } from "zod";

/** Idiomas en los que puede operar el negocio, en el orden del prototipo. */
export const LANGUAGES = {
  es: "Español",
  en: "Inglés",
  de: "Alemán",
  fr: "Francés",
  it: "Italiano",
  nl: "Neerlandés",
} as const;

export type LanguageCode = keyof typeof LANGUAGES;

export const LANGUAGE_CODES = Object.keys(LANGUAGES) as LanguageCode[];

export function isLanguageCode(value: string): value is LanguageCode {
  return Object.hasOwn(LANGUAGES, value);
}

export const CURRENCIES = ["EUR", "USD", "GBP"] as const;

/** Límites de la tabla settings (supabase/migrations/…_catalog.sql). */
export const SETTINGS_LIMITS = {
  businessName: 120,
  email: 254,
  phone: 40,
  capacity: { min: 1, max: 500 },
  hours: { min: 0, max: 720 },
  legalName: 200,
  taxId: 20,
  address: 300,
  registryInfo: 300,
  tourismRegistry: 60,
  retentionMonths: { min: 6, max: 120 },
} as const;

// Un campo vacío no cuenta como 0: es un error.
const integerIn = (min: number, max: number, label: string) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.coerce
      .number({ error: `${label}: escribe un número.` })
      .int({ error: `${label}: escribe un número entero.` })
      .min(min, { error: `${label}: mínimo ${min}.` })
      .max(max, { error: `${label}: máximo ${max}.` }),
  );

/** Campos de Ajustes que se editan uno a uno (se guardan solos al salir del campo). */
const settingsFieldSchemas = {
  business_name: z
    .string()
    .trim()
    .min(1, { error: "El nombre comercial no puede quedar vacío." })
    .max(SETTINGS_LIMITS.businessName, { error: `El nombre admite ${SETTINGS_LIMITS.businessName} caracteres como máximo.` }),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(SETTINGS_LIMITS.email, { error: "El email es demasiado largo." })
    .refine((value) => value === "" || z.email().safeParse(value).success, { error: "El email no es válido." }),
  phone: z
    .string()
    .trim()
    .max(SETTINGS_LIMITS.phone, { error: `El teléfono admite ${SETTINGS_LIMITS.phone} caracteres como máximo.` })
    .refine((value) => /^[0-9+()\s.-]*$/.test(value), { error: "El teléfono solo puede tener números, espacios y + ( ) - ." }),
  currency: z.enum(CURRENCIES, { error: "Moneda no admitida." }),
  default_capacity: integerIn(SETTINGS_LIMITS.capacity.min, SETTINGS_LIMITS.capacity.max, "Aforo por defecto"),
  cutoff_hours: integerIn(SETTINGS_LIMITS.hours.min, SETTINGS_LIMITS.hours.max, "Cierre de venta"),
  cancel_hours: integerIn(SETTINGS_LIMITS.hours.min, SETTINGS_LIMITS.hours.max, "Cancelación gratuita"),
  legal_name: z
    .string()
    .trim()
    .max(SETTINGS_LIMITS.legalName, { error: `La razón social admite ${SETTINGS_LIMITS.legalName} caracteres como máximo.` }),
  tax_id: z
    .string()
    .trim()
    .toUpperCase()
    .max(SETTINGS_LIMITS.taxId, { error: `El NIF admite ${SETTINGS_LIMITS.taxId} caracteres como máximo.` })
    .refine((value) => /^[0-9A-Z-]*$/.test(value), { error: "El NIF solo puede tener letras, números y guiones." }),
  address: z
    .string()
    .trim()
    .max(SETTINGS_LIMITS.address, { error: `La dirección admite ${SETTINGS_LIMITS.address} caracteres como máximo.` }),
  registry_info: z
    .string()
    .trim()
    .max(SETTINGS_LIMITS.registryInfo, { error: `Los datos registrales admiten ${SETTINGS_LIMITS.registryInfo} caracteres como máximo.` }),
  tourism_registry: z
    .string()
    .trim()
    .max(SETTINGS_LIMITS.tourismRegistry, {
      error: `El número de registro turístico admite ${SETTINGS_LIMITS.tourismRegistry} caracteres como máximo.`,
    }),
  customer_retention_months: integerIn(
    SETTINGS_LIMITS.retentionMonths.min,
    SETTINGS_LIMITS.retentionMonths.max,
    "Conservación de datos",
  ),
};

export type SettingsField = keyof typeof settingsFieldSchemas;
export type SettingsValue<F extends SettingsField> = z.infer<(typeof settingsFieldSchemas)[F]>;

export const SETTINGS_FIELDS = Object.keys(settingsFieldSchemas) as SettingsField[];

export function isSettingsField(value: string): value is SettingsField {
  return Object.hasOwn(settingsFieldSchemas, value);
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Valor no válido.";
}

/** Valida y normaliza el valor de un campo de Ajustes tal y como llega del formulario. */
export function parseSettingsField<F extends SettingsField>(field: F, raw: unknown): Parsed<SettingsValue<F>> {
  const result = settingsFieldSchemas[field].safeParse(raw);
  if (!result.success) return { ok: false, error: firstError(result.error) };
  return { ok: true, value: result.data as SettingsValue<F> };
}

/**
 * Activa o desactiva un idioma. Siempre queda al menos uno, y no se quita un idioma que
 * todavía usan las reglas de horario (habría salidas en un idioma en el que no se opera).
 * Devuelve los idiomas en el orden de LANGUAGES.
 */
export function toggleLanguage(
  current: readonly string[],
  language: LanguageCode,
  usedBySchedules: readonly string[],
): Parsed<LanguageCode[]> {
  const active = new Set(current.filter(isLanguageCode));
  if (active.has(language)) {
    if (active.size === 1) return { ok: false, error: "Tiene que quedar al menos un idioma." };
    if (usedBySchedules.includes(language)) {
      return {
        ok: false,
        error: `Hay horarios en ${LANGUAGES[language].toLowerCase()}. Cámbialos en Productos antes de quitar el idioma.`,
      };
    }
    active.delete(language);
  } else {
    active.add(language);
  }
  return { ok: true, value: LANGUAGE_CODES.filter((code) => active.has(code)) };
}

/** Límites de la tabla ticket_types. */
export const TICKET_TYPE_LIMITS = { name: 60, note: 120 } as const;

const ticketTypeFieldSchemas = {
  name: z
    .string()
    .trim()
    .min(1, { error: "El nombre de la entrada no puede quedar vacío." })
    .max(TICKET_TYPE_LIMITS.name, { error: `El nombre admite ${TICKET_TYPE_LIMITS.name} caracteres como máximo.` }),
  note: z
    .string()
    .trim()
    .max(TICKET_TYPE_LIMITS.note, { error: `La condición admite ${TICKET_TYPE_LIMITS.note} caracteres como máximo.` }),
  takes_seat: z.boolean({ error: "Valor no válido." }),
  // En inglés, para la web /en (opcionales: vacíos, la web muestra el español).
  name_en: z
    .string()
    .trim()
    .max(TICKET_TYPE_LIMITS.name, { error: `El nombre en inglés admite ${TICKET_TYPE_LIMITS.name} caracteres como máximo.` }),
  note_en: z
    .string()
    .trim()
    .max(TICKET_TYPE_LIMITS.note, { error: `La condición en inglés admite ${TICKET_TYPE_LIMITS.note} caracteres como máximo.` }),
};

export type TicketTypeField = keyof typeof ticketTypeFieldSchemas;
export type TicketTypeValue<F extends TicketTypeField> = z.infer<(typeof ticketTypeFieldSchemas)[F]>;

export function isTicketTypeField(value: string): value is TicketTypeField {
  return Object.hasOwn(ticketTypeFieldSchemas, value);
}

export function parseTicketTypeField<F extends TicketTypeField>(field: F, raw: unknown): Parsed<TicketTypeValue<F>> {
  const result = ticketTypeFieldSchemas[field].safeParse(raw);
  if (!result.success) return { ok: false, error: firstError(result.error) };
  return { ok: true, value: result.data as TicketTypeValue<F> };
}

/** Posición de un tipo de entrada nuevo: al final de la lista. */
export function nextTicketTypeSort(existing: readonly { sort: number }[]): number {
  return existing.reduce((max, ticketType) => Math.max(max, ticketType.sort), 0) + 1;
}

/**
 * Nombres de los productos que solo venden el tipo de entrada indicado: al borrarlo se
 * quedarían sin ningún precio.
 */
export function productsLeftWithoutPrices(
  prices: readonly { product_id: string; ticket_type_id: string; products: { name: string } | null }[],
  ticketTypeId: string,
): string[] {
  const byProduct = new Map<string, { name: string; types: Set<string> }>();
  for (const price of prices) {
    const entry = byProduct.get(price.product_id) ?? { name: price.products?.name ?? "", types: new Set<string>() };
    entry.types.add(price.ticket_type_id);
    byProduct.set(price.product_id, entry);
  }
  return [...byProduct.values()]
    .filter((product) => product.types.size === 1 && product.types.has(ticketTypeId))
    .map((product) => product.name);
}
