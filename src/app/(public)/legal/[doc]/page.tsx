import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { localizedPath } from "@/lib/domain/i18n";
import { isLegalDoc, LEGAL_DOCS, LEGAL_TITLES, legalDocument } from "@/lib/domain/legal";
import { getLocale } from "@/lib/i18n";

import { loadLegalInfo } from "../../data";

export async function generateMetadata({ params }: PageProps<"/legal/[doc]">): Promise<Metadata> {
  const { doc } = await params;
  if (!isLegalDoc(doc)) return {};
  return { title: LEGAL_TITLES[await getLocale()][doc] };
}

/** Privacidad, aviso legal y condiciones, y cookies (tarea 4.5), con los datos del titular de Ajustes. */
export default async function LegalPage({ params }: PageProps<"/legal/[doc]">) {
  const { doc } = await params;
  if (!isLegalDoc(doc)) notFound();
  const [locale, info] = await Promise.all([getLocale(), loadLegalInfo()]);
  const document = legalDocument(doc, locale, info);

  return (
    <article className="mx-auto flex w-full max-w-[720px] flex-col gap-5 px-4 py-6 tablet:px-[22px] tablet:py-10">
      <header>
        <h1 className="text-[1.6rem] tracking-[-0.02em] tablet:text-[2rem]">{document.title}</h1>
        <p className="mt-1 text-[0.8rem] text-muted-foreground">
          {locale === "en" ? "Last updated" : "Última actualización"}: {document.updated}
        </p>
      </header>
      {document.sections.map((section) => (
        <section key={section.heading} className="flex flex-col gap-1.5">
          <h2 className="text-[1.05rem] font-semibold">{section.heading}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph} className="text-[0.92rem] leading-relaxed text-[#2a3644]">
              {paragraph}
            </p>
          ))}
        </section>
      ))}
      <nav aria-label={locale === "en" ? "Legal" : "Textos legales"} className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line-2 pt-4 text-[0.82rem]">
        {LEGAL_DOCS.filter((other) => other !== doc).map((other) => (
          <Link key={other} href={localizedPath(locale, `/legal/${other}`)} className="text-primary underline-offset-2 hover:underline">
            {LEGAL_TITLES[locale][other]}
          </Link>
        ))}
      </nav>
    </article>
  );
}
