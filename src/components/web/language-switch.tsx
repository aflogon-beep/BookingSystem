"use client";

import { localizedPath, splitLocale, type Locale } from "@/lib/domain/i18n";

/**
 * Enlace a la misma página en el otro idioma. Recarga la página entera (cambia el `lang` de
 * <html>) y calcula la ruta al pulsar: el layout no se vuelve a pintar al navegar dentro de la web,
 * así que el `href` del servidor puede ser el de la primera página visitada.
 */
export function LanguageSwitch({ locale, href, label }: { locale: Locale; href: string; label: string }) {
  return (
    <a
      href={href}
      hrefLang={locale}
      lang={locale}
      title={label}
      className="rounded px-1 hover:text-foreground"
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        const { path } = splitLocale(window.location.pathname);
        window.location.assign(localizedPath(locale, `${path}${window.location.search}`));
      }}
    >
      {locale.toUpperCase()}
      <span className="sr-only"> · {label}</span>
    </a>
  );
}
