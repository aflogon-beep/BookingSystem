import "server-only";

import { headers } from "next/headers";

import { DEFAULT_LOCALE, isLocale, LOCALE_HEADER, PUBLIC_PATH_HEADER, type Locale } from "@/lib/domain/i18n";

/**
 * Idioma de la petición a la web pública, según lo que haya puesto el proxy (si no, español). El
 * proxy pone las dos cabeceras juntas y solo en la web pública; sin la ruta, no se hace caso.
 */
export async function getLocale(): Promise<Locale> {
  const list = await headers();
  const value = list.get(LOCALE_HEADER);
  return isLocale(value) && list.has(PUBLIC_PATH_HEADER) ? value : DEFAULT_LOCALE;
}

/** Ruta pública sin el prefijo de idioma y con su `?…` (para el selector de idioma). */
export async function getPublicPath(): Promise<string> {
  const value = (await headers()).get(PUBLIC_PATH_HEADER);
  return value?.startsWith("/") ? value : "/";
}
