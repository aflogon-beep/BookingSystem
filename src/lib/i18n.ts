import "server-only";

import { headers } from "next/headers";

import { DEFAULT_LOCALE, isLocale, LOCALE_HEADER, PUBLIC_PATH_HEADER, type Locale } from "@/lib/domain/i18n";

/** Idioma de la petición a la web pública, según lo que haya puesto el proxy (si no, español). */
export async function getLocale(): Promise<Locale> {
  const value = (await headers()).get(LOCALE_HEADER);
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Ruta pública sin el prefijo de idioma y con su `?…` (para el selector de idioma). */
export async function getPublicPath(): Promise<string> {
  const value = (await headers()).get(PUBLIC_PATH_HEADER);
  return value?.startsWith("/") ? value : "/";
}
