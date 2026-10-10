import Link from "next/link";
import { Languages, Phone } from "lucide-react";

import { LanguageSwitch } from "@/components/web/language-switch";
import { LOCALES, localizedPath } from "@/lib/domain/i18n";
import { LEGAL_DOCS, LEGAL_TITLES } from "@/lib/domain/legal";
import { webText } from "@/lib/domain/web-text";
import { getLocale, getPublicPath } from "@/lib/i18n";

import { loadSite } from "./data";

/**
 * Web de reservas para clientes: cabecera con el nombre del negocio, contacto y el selector de
 * idioma (ES/EN), como el prototipo.
 */
export default async function PublicLayout({ children }: LayoutProps<"/">) {
  const [site, locale, path] = await Promise.all([loadSite(), getLocale(), getPublicPath()]);
  const text = webText(locale);
  return (
    <div className="flex min-h-full flex-1 flex-col bg-surface">
      <header className="border-b border-line-2">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2.5 px-4 py-3.5 tablet:px-[22px]">
          <Link href={localizedPath(locale, "/")} className="text-[1.05rem] font-bold tracking-[-0.02em]">
            {site.businessName}
          </Link>
          <div className="flex items-center gap-3 text-[0.8rem] text-muted-foreground">
            {site.phone ? (
              <a href={`tel:${site.phone.replace(/[^0-9+]/g, "")}`} className="hidden items-center gap-1 hover:text-foreground tablet:inline-flex">
                <Phone aria-hidden="true" className="size-4" />
                {site.phone}
              </a>
            ) : null}
            <nav aria-label={text.languageLabel} className="inline-flex items-center gap-1">
              <Languages aria-hidden="true" className="size-4" />
              {LOCALES.map((option) =>
                option === locale ? (
                  <span key={option} aria-current="true" className="px-1 font-semibold text-foreground">
                    {option.toUpperCase()}
                  </span>
                ) : (
                  <LanguageSwitch key={option} locale={option} href={localizedPath(option, path)} label={text.switchTo} />
                ),
              )}
            </nav>
          </div>
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
      <footer className="border-t border-line-2">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap justify-between gap-2 px-4 py-5 text-[0.75rem] text-faint tablet:px-[22px]">
          <span>
            © {new Date().getFullYear()} {site.businessName}
          </span>
          <nav aria-label={text.legalLabel} className="flex flex-wrap gap-x-3 gap-y-1">
            {LEGAL_DOCS.map((doc) => (
              <Link key={doc} href={localizedPath(locale, `/legal/${doc}`)} className="hover:text-foreground">
                {LEGAL_TITLES[locale][doc]}
              </Link>
            ))}
            {site.email ? (
              <a href={`mailto:${site.email}`} className="hover:text-foreground">
                {site.email}
              </a>
            ) : null}
          </nav>
        </div>
      </footer>
    </div>
  );
}
