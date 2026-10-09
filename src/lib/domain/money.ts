const baseOptions = {
  style: "currency",
  currency: "EUR",
  signDisplay: "negative",
} as const satisfies Intl.NumberFormatOptions;

/** «es» o «en» (web pública en inglés: «€45», «€12.50»). */
type MoneyLocale = "es" | "en";

const INTL_LOCALES = { es: "es-ES", en: "en-GB" } as const satisfies Record<MoneyLocale, string>;

function formatters(locale: MoneyLocale) {
  return {
    whole: new Intl.NumberFormat(INTL_LOCALES[locale], { ...baseOptions, minimumFractionDigits: 0, maximumFractionDigits: 0 }),
    cents: new Intl.NumberFormat(INTL_LOCALES[locale], { ...baseOptions, minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  };
}

const FORMATTERS = { es: formatters("es"), en: formatters("en") } as const;

/** Euros sin decimales, redondeados, para sitios estrechos (celdas del calendario): 14950 → «150 €». */
export function formatWholeEuros(cents: number, locale: MoneyLocale = "es"): string {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(`El importe debe ser un entero en céntimos: ${cents}`);
  }
  return FORMATTERS[locale].whole.format(Math.round(cents / 100));
}

/**
 * Formatea un importe en céntimos (entero) como euros en es-ES, igual que el prototipo:
 * sin decimales en euros enteros (4500 → "45 €") y con dos si hay céntimos (1250 → "12,50 €").
 */
export function formatCents(cents: number, locale: MoneyLocale = "es"): string {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(`El importe debe ser un entero en céntimos: ${cents}`);
  }
  const formatter = cents % 100 === 0 ? FORMATTERS[locale].whole : FORMATTERS[locale].cents;
  return formatter.format(cents / 100);
}
