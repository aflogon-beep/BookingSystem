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
import { isLanguageCode, LANGUAGES } from "@/lib/domain/settings";
import { isSlug, parseTicketsParam, storefrontHref } from "@/lib/domain/storefront";
import { resolveCart } from "@/lib/domain/web-checkout";

import { loadSite, loadWebProduct, loadWebSession } from "../../../data";

export const metadata: Metadata = { title: "Completa tu reserva", robots: { index: false } };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CheckoutPage({ params, searchParams }: PageProps<"/experiencias/[slug]/reservar">) {
  const { slug } = await params;
  if (!isSlug(slug)) notFound();
  const [site, product] = await Promise.all([loadSite(), loadWebProduct(slug)]);
  if (!product) notFound();

  const search = await searchParams;
  const rawSession = first(search.salida);
  const sessionId = rawSession && z.uuid().safeParse(rawSession).success ? rawSession.toLowerCase() : null;
  const requested = parseTicketsParam(first(search.entradas));
  const session = sessionId ? await loadWebSession(product.id, sessionId, site.cutoffHours) : null;
  const cart = session && requested ? resolveCart(product.tickets, requested, session.free) : null;
  const backHref = session
    ? storefrontHref(product.slug, { month: session.date.slice(0, 7), date: session.date, sessionId: session.id })
    : storefrontHref(product.slug, {});

  if (!session || !requested || !cart?.ok) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 px-4 py-16 text-center">
        <CalendarX aria-hidden="true" className="size-10 text-muted-foreground" />
        <h1 className="text-[1.3rem]">{session ? "Revisa tus entradas" : "Esta salida ya no está disponible"}</h1>
        <p className="text-muted-foreground">
          {cart && !cart.ok ? cart.error : "Puede que se haya completado o que ya no se venda por la web. Elige otro horario."}
        </p>
        <Button asChild>
          <Link href={backHref}>Volver a {product.name}</Link>
        </Button>
      </div>
    );
  }

  const language = isLanguageCode(session.language) ? LANGUAGES[session.language] : session.language.toUpperCase();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-[22px] tablet:px-[22px]">
      <Button asChild variant="ghost" size="sm" className="-ml-1 mb-2 px-1">
        <Link href={backHref}>
          <ArrowLeft aria-hidden="true" />
          Cambiar
        </Link>
      </Button>
      <h1 className="mb-4 text-[1.35rem]">Completa tu reserva</h1>
      <div className="grid grid-cols-1 items-start gap-[26px] desk:grid-cols-[minmax(0,1fr)_340px]">
        <aside
          aria-label="Tu reserva"
          className="overflow-hidden rounded-2xl border border-black/5 bg-surface-2 desk:order-2"
        >
          <ProductArt seed={product.id} color={product.color} photoUrl={product.photoUrl} className="h-28" />
          <div className="flex flex-col gap-2.5 p-4">
            <div>
              <b className="font-semibold">{product.name}</b>
              <p className="text-[0.84rem] text-muted-foreground">
                <span className="first-letter:uppercase inline-block">{longDayLabel(session.date)}</span> ·{" "}
                <span className="font-mono">{session.time}</span> · {language}
              </p>
            </div>
            <ul className="flex flex-col gap-1 text-[0.86rem]">
              {cart.lines.map((line) => (
                <li key={line.ticket.id} className="flex justify-between gap-2.5">
                  <span>
                    {line.qty} × {line.ticket.name}
                  </span>
                  <span className="tabular-nums">{formatCents(line.qty * line.ticket.priceCents)}</span>
                </li>
              ))}
            </ul>
            <p className="flex items-baseline justify-between border-t border-line pt-2.5">
              <span>Total</span>
              <b className="text-[1.3rem] font-semibold tabular-nums">{formatCents(cart.totalCents)}</b>
            </p>
          </div>
        </aside>

        <WebCheckoutForm
          slug={product.slug}
          sessionId={session.id}
          lines={cart.lines.map((line) => ({ ticketTypeId: line.ticket.id, qty: line.qty }))}
          totalLabel={formatCents(cart.totalCents)}
          pickup={product.pickup}
          meetingPoint={product.meetingPoint}
          cancelHours={site.cancelHours}
        />
      </div>
    </div>
  );
}
