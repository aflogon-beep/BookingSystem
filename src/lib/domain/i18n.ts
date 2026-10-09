/**
 * Idiomas de la web pública (tarea 2.5). El español va en las URL de siempre y el inglés con el
 * prefijo /en (`/en/experiencias/teide`). El proxy quita el prefijo, reescribe a la misma página y
 * le pasa el idioma en una cabecera. El panel del equipo sigue solo en español.
 */

export const LOCALES = ["es", "en"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "es";

/** Cabeceras que pone el proxy en las peticiones a la web pública (nunca se fían de las del cliente). */
export const LOCALE_HEADER = "x-locale";
export const PUBLIC_PATH_HEADER = "x-public-path";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** «/en/experiencias/x» → en + «/experiencias/x»; sin prefijo, español. */
export function splitLocale(pathname: string): { locale: Locale; path: string } {
  for (const locale of LOCALES) {
    if (locale === DEFAULT_LOCALE) continue;
    if (pathname === `/${locale}`) return { locale, path: "/" };
    if (pathname.startsWith(`/${locale}/`)) return { locale, path: pathname.slice(locale.length + 1) };
  }
  return { locale: DEFAULT_LOCALE, path: pathname };
}

/** Rutas de la web pública: el listado, las fichas con su pago y la confirmación. */
export function isPublicPath(path: string): boolean {
  return path === "/" || /^\/(experiencias|reserva)\/[^/]/.test(path);
}

/** Texto del catálogo en el idioma de la web: el inglés si lo hay; si no, el español. */
export function localizedText(locale: Locale, es: string, en: string): string {
  return locale === "en" && en.trim() ? en : es;
}

/** Ruta (con su `?…`) en un idioma: «/experiencias/x?mes=…» → «/en/experiencias/x?mes=…». */
export function localizedPath(locale: Locale, path: string): string {
  if (locale === DEFAULT_LOCALE) return path;
  if (path === "/") return `/${locale}`;
  if (path.startsWith("/?")) return `/${locale}${path.slice(1)}`;
  return `/${locale}${path}`;
}
