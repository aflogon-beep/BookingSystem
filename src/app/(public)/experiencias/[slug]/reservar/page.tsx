import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarX } from "lucide-react";
import { z } from "zod";

import { ProductArt } from "@/components/productos/product-art";
import { Button } from "@/components/ui/button";
import { WebCheckoutForm } from "@/components/web/checkout-form";
import { longDayLabel } from "@/lib/domain/calendar";
import { formatCents } from "@/lib/domain/money";
import { localizedPath } from "@/lib/domain/i18n";
import { isSlug, parseTicketsParam, storefrontHref } from "@/lib/domain/storefront";
import { resolveCart } from "@/lib/domain/web-checkout";
import { languageName, webText } from "@/lib/domain/web-text";
import { getLocale } from "@/lib/i18n";

import { loadSite, loadWebProduct, loadWebSession } from "../../../data";

export async function generateMetadata(): Promise<Metadata> {
  return { title: webText(await getLocale()).checkoutTitle, robots: { index: false } };
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CheckoutPage({ params, searchParams }: PageProps<"/experiencias/[slug]/reservar">) {
  const { slug } = await params;
  if (!isSlug(slug)) notFound();
  const locale = await getLocale();
  const [site, product] = await Promise.all([loadSite(), loadWebProduct(slug, locale)]);
  if (!product) notFound();
  const text = webText(locale);

  const search = await searchParams;
  const rawSession = first(search.salida);
  const sessionId = rawSession && z.uuid().safeParse(rawSession).success ? rawSession.toLowerCase() : null;
  const requested = parseTicketsParam(first(search.entradas));
  const session = sessionId ? await loadWebSession(product.id, sessionId, site.cutoffHours) : null;
  const cart = session && requested ? resolveCart(product.tickets, requested, session.free, locale) : null;
  const backHref = localizedPath(
    locale,
    session
      ? storefrontHref(product.slug, { month: session.date.slice(0, 7), date: session.date, sessionId: session.id })
      : storefrontHref(product.slug, {}),
  );

  if (!session || !requested || !cart?.ok) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 px-4 py-16 text-center">
        <CalendarX aria-hidden="true" className="size-10 text-muted-foreground" />
        <h1 className="text-[1.3rem]">{session ? text.checkTickets : text.sessionGone}</h1>
        <p className="text-muted-foreground">{cart && !cart.ok ? cart.error : text.sessionGoneText}</p>
        <Button asChild>
          <Link href={backHref}>{text.backTo(product.name)}</Link>
        </Button>
      </div>
    );
  }

  const language = languageName(session.language, locale);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-[22px] tablet:px-[22px]">
      <Button asChild variant="ghost" size="sm" className="-ml-1 mb-2 px-1">
        <Link href={backHref}>
          <ArrowLeft aria-hidden="true" />
          {text.change}
        </Link>
      </Button>
      <h1 className="mb-4 text-[1.35rem]">{text.checkoutTitle}</h1>
      <div className="grid grid-cols-1 items-start gap-[26px] desk:grid-cols-[minmax(0,1fr)_340px]">
        <aside
          aria-label={text.yourBooking}
          className="overflow-hidden rounded-2xl border border-black/5 bg-surface-2 desk:order-2"
        >
          <ProductArt seed={product.id} color={product.color} photoUrl={product.photoUrl} className="h-28" />
          <div className="flex flex-col gap-2.5 p-4">
            <div>
              <b className="font-semibold">{product.name}</b>
              <p className="text-[0.84rem] text-muted-foreground">
                <span className="first-letter:uppercase inline-block">{longDayLabel(session.date, locale)}</span> ·{" "}
                <span className="font-mono">{session.time}</span> · {language}
              </p>
            </div>
            <ul className="flex flex-col gap-1 text-[0.86rem]">
              {cart.lines.map((line) => (
                <li key={line.ticket.id} className="flex justify-between gap-2.5">
                  <span>
                    {line.qty} × {line.ticket.name}
                  </span>
                  <span className="tabular-nums">{formatCents(line.qty * line.ticket.priceCents, locale)}</span>
                </li>
              ))}
            </ul>
            <p className="flex items-baseline justify-between border-t border-line pt-2.5">
              <span>{text.total}</span>
              <b className="text-[1.3rem] font-semibold tabular-nums">{formatCents(cart.totalCents, locale)}</b>
            </p>
          </div>
        </aside>

        <WebCheckoutForm
          locale={locale}
          slug={product.slug}
          sessionId={session.id}
          lines={cart.lines.map((line) => ({ ticketTypeId: line.ticket.id, qty: line.qty }))}
          totalCents={cart.totalCents}
          totalLabel={formatCents(cart.totalCents, locale)}
          pickup={product.pickup}
          meetingPoint={product.meetingPoint}
          cancelHours={site.cancelHours}
        />
      </div>
    </div>
  );
}
