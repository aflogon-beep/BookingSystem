import type { Metadata } from "next";
import Link from "next/link";
import { Clock, Languages } from "lucide-react";

import { ProductArt } from "@/components/productos/product-art";
import { localizedPath } from "@/lib/domain/i18n";
import { formatCents } from "@/lib/domain/money";
import { durationLabel } from "@/lib/domain/product";
import { webText } from "@/lib/domain/web-text";
import { getLocale } from "@/lib/i18n";

import { loadSite, loadWebProducts } from "./data";

export async function generateMetadata(): Promise<Metadata> {
  const [site, locale] = await Promise.all([loadSite(), getLocale()]);
  return { title: `${webText(locale).homeTitle} · ${site.businessName}` };
}

export default async function HomePage() {
  const [products, locale] = await Promise.all([loadWebProducts(), getLocale()]);
  const text = webText(locale);
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-[22px] tablet:px-[22px]">
      <h1 className="mb-1 text-[1.35rem]">{text.homeTitle}</h1>
      <p className="mb-4 text-muted-foreground">{text.homeIntro}</p>
      {products.length ? (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-[18px]">
          {products.map((product) => (
            <li key={product.id}>
              <Link
                href={localizedPath(locale, `/experiencias/${encodeURIComponent(product.slug)}`)}
                className="group flex flex-col gap-2 rounded-2xl outline-offset-4"
              >
                <ProductArt
                  seed={product.id}
                  color={product.color}
                  photoUrl={product.photoUrl}
                  className="h-[190px] rounded-2xl group-hover:brightness-[1.04] group-hover:saturate-[1.1]"
                />
                <b className="text-base font-semibold">{product.name}</b>
                <span className="flex flex-wrap gap-x-3.5 gap-y-1 text-[0.8rem] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock aria-hidden="true" className="size-4" />
                    {durationLabel(product.durationMin)}
                  </span>
                  {product.languages.length ? (
                    <span className="inline-flex items-center gap-1">
                      <Languages aria-hidden="true" className="size-4" />
                      {product.languages.map((language) => language.toUpperCase()).join(" · ")}
                    </span>
                  ) : null}
                </span>
                {product.fromCents > 0 ? (
                  <span>
                    <span className="text-[0.8rem] text-muted-foreground">{text.from} </span>
                    <b className="text-[1.05rem] font-semibold">{formatCents(product.fromCents, locale)}</b>
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">{text.noProducts}</p>
      )}
    </div>
  );
}
