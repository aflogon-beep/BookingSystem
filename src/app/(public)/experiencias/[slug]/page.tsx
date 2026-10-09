import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bus, CalendarCheck, ChevronLeft, ChevronRight, Clock, Languages, MapPin, Users } from "lucide-react";

import { ProductArt } from "@/components/productos/product-art";
import { TicketPicker } from "@/components/web/ticket-picker";
import { longDayLabel } from "@/lib/domain/calendar";
import { formatCents, formatWholeEuros } from "@/lib/domain/money";
import { durationLabel } from "@/lib/domain/product";
import { businessToday, WEEKDAY_INITIALS } from "@/lib/domain/schedule";
import { localizedPath } from "@/lib/domain/i18n";
import {
  bookableDays,
  isSlug,
  monthGrid,
  monthTitle,
  parseStorefrontParams,
  seatsLeftLabel,
  shiftMonth,
  storefrontHref,
} from "@/lib/domain/storefront";
import { languageName, webText } from "@/lib/domain/web-text";
import { getLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { loadSite, loadWebProduct, loadWebSessions } from "../../data";

const WEEKDAY_INITIALS_EN = ["M", "T", "W", "T", "F", "S", "S"] as const;

export async function generateMetadata({ params }: PageProps<"/experiencias/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const [site, product] = await Promise.all([loadSite(), isSlug(slug) ? loadWebProduct(slug) : null]);
  if (!product) return { title: site.businessName };
  return { title: `${product.name} · ${site.businessName}`, description: product.description.slice(0, 160) || undefined };
}

export default async function ProductPage({ params, searchParams }: PageProps<"/experiencias/[slug]">) {
  const { slug } = await params;
  if (!isSlug(slug)) notFound();
  const [site, product, locale] = await Promise.all([loadSite(), loadWebProduct(slug), getLocale()]);
  if (!product) notFound();
  const text = webText(locale);
  const href = (path: string) => localizedPath(locale, path);

  const now = new Date();
  const today = businessToday(now);
  const sessions = await loadWebSessions(product.id, site.cutoffHours, now);
  const days = bookableDays(sessions);
  const selection = parseStorefrontParams(await searchParams, days, today);
  const times = selection.date ? (days.get(selection.date) ?? []) : [];
  const session = times.find((candidate) => candidate.id === selection.sessionId) ?? null;
  const lastMonth = [...days.keys()].at(-1)?.slice(0, 7) ?? today.slice(0, 7);
  const canPrev = selection.month > today.slice(0, 7);
  const canNext = selection.month < lastMonth;
  const monthHref = (month: string) =>
    href(storefrontHref(product.slug, { month, date: selection.date, sessionId: selection.sessionId }));

  return (
    <article>
      <div className="relative mx-auto w-full max-w-6xl tablet:px-[22px] tablet:pt-[22px]">
        <div className="relative overflow-hidden tablet:rounded-[20px]">
          <ProductArt seed={product.id} color={product.color} photoUrl={product.photoUrl} className="h-[170px] tablet:h-[300px]" />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgb(0_0_0/0.6),rgb(0_0_0/0.05)_65%)]"
          />
          <div className="absolute inset-x-4 bottom-[18px] text-white [text-shadow:0_2px_12px_rgb(0_0_0/0.35)] tablet:inset-x-[22px]">
            <Link
              href={href("/")}
              className="mb-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-3 py-1.5 text-[0.8rem] font-medium text-foreground [text-shadow:none] hover:bg-white"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              {text.experiences}
            </Link>
            <h1 className="text-[1.6rem] font-bold">{product.name}</h1>
          </div>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-start gap-[26px] px-4 py-[22px] tablet:px-[22px] desk:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-4">
          {product.description ? <p className="text-[0.95rem] whitespace-pre-line">{product.description}</p> : null}
          <ul className="flex flex-wrap gap-x-[22px] gap-y-2.5 text-[0.86rem] text-muted-foreground" aria-label={text.details}>
            <li className="inline-flex items-center gap-1.5">
              <Clock aria-hidden="true" className="size-4" />
              {durationLabel(product.durationMin)}
            </li>
            {product.languages.length ? (
              <li className="inline-flex items-center gap-1.5">
                <Languages aria-hidden="true" className="size-4" />
                {product.languages.map((code) => languageName(code, locale)).join(", ")}
              </li>
            ) : null}
            <li className="inline-flex items-center gap-1.5">
              <Users aria-hidden="true" className="size-4" />
              {text.maxPeople(product.capacity)}
            </li>
            {product.pickup ? (
              <li className="inline-flex items-center gap-1.5">
                <Bus aria-hidden="true" className="size-4" />
                {text.hotelPickup}
              </li>
            ) : null}
          </ul>
          {product.meetingPoint ? (
            <section className="rounded-2xl border border-black/5 bg-surface-2 p-4">
              <h2 className="mb-2 text-[0.68rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                {text.meetingPoint}
              </h2>
              <p className="flex items-start gap-1.5">
                <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                {product.meetingPoint}
              </p>
            </section>
          ) : null}
          <p className="flex items-start gap-2 text-ok">
            <CalendarCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              {site.cancelHours > 0 ? `${text.freeCancellation(site.cancelHours)} ` : ""}
              {text.bookNow}
            </span>
          </p>
        </div>

        <aside
          aria-label={text.book}
          className="flex flex-col gap-3 rounded-xl border border-line p-4 shadow-[0_8px_24px_rgb(16_24_40/0.08)]"
        >
          {product.fromCents > 0 ? (
            <p className="flex items-baseline justify-between">
              <span className="text-muted-foreground">{text.from}</span>
              <b className="text-[1.4rem] font-semibold">{formatCents(product.fromCents, locale)}</b>
            </p>
          ) : null}

          <section aria-labelledby="calendario-mes">
            <div className="mb-2 flex items-center justify-between">
              <h2 id="calendario-mes" className="text-[0.95rem] first-letter:uppercase">
                {monthTitle(selection.month, locale)}
              </h2>
              <div className="flex gap-1">
                <MonthLink href={canPrev ? monthHref(shiftMonth(selection.month, -1)) : null} label={text.previousMonth}>
                  <ChevronLeft aria-hidden="true" className="size-4" />
                </MonthLink>
                <MonthLink href={canNext ? monthHref(shiftMonth(selection.month, 1)) : null} label={text.nextMonth}>
                  <ChevronRight aria-hidden="true" className="size-4" />
                </MonthLink>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-[3px] text-center">
              {(locale === "en" ? WEEKDAY_INITIALS_EN : WEEKDAY_INITIALS).map((initial, index) => (
                <span key={index} aria-hidden="true" className="py-1 text-[0.66rem] font-semibold text-faint">
                  {initial}
                </span>
              ))}
              {monthGrid(selection.month)
                .flat()
                .map((day, index) => {
                  if (!day) return <span key={`hueco-${index}`} />;
                  const label = Number(day.slice(8));
                  if (!days.has(day)) {
                    return (
                      <span key={day} aria-hidden="true" className="flex min-h-[42px] items-start justify-center pt-[5px] text-[0.82rem] text-faint">
                        {label}
                      </span>
                    );
                  }
                  const selected = day === selection.date;
                  return (
                    <Link
                      key={day}
                      href={href(storefrontHref(product.slug, { month: selection.month, date: day }))}
                      scroll={false}
                      prefetch={false}
                      aria-current={selected ? "date" : undefined}
                      aria-label={`${longDayLabel(day, locale)}${product.fromCents > 0 ? text.dayFrom(formatCents(product.fromCents, locale)) : ""}`}
                      className={cn(
                        "flex min-h-[42px] flex-col items-center rounded-lg py-[5px] text-[0.82rem] font-semibold",
                        selected ? "bg-primary text-white" : "bg-primary-soft text-foreground hover:bg-[#d6e8fb]",
                      )}
                    >
                      {label}
                      {product.fromCents > 0 ? (
                        <small className={cn("text-[0.58rem] font-medium", selected ? "text-white" : "text-primary-dark")}>
                          {formatWholeEuros(product.fromCents, locale)}
                        </small>
                      ) : null}
                    </Link>
                  );
                })}
            </div>
            {days.size === 0 ? (
              <p className="mt-2 text-[0.84rem] text-muted-foreground">{text.noDates}</p>
            ) : null}
          </section>

          {selection.date ? (
            <section aria-labelledby="horarios">
              <h2 id="horarios" className="mb-2 text-[0.68rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                {text.timesOn(longDayLabel(selection.date, locale))}
              </h2>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
                {times.map((candidate) => {
                  const seats = seatsLeftLabel(candidate.free, locale);
                  const selected = candidate.id === session?.id;
                  return (
                    <li key={candidate.id}>
                      <Link
                        href={href(
                          storefrontHref(product.slug, {
                            month: selection.month,
                            date: selection.date,
                            sessionId: candidate.id,
                          }),
                        )}
                        scroll={false}
                        prefetch={false}
                        aria-current={selected ? "true" : undefined}
                        className={cn(
                          "flex flex-col gap-0.5 rounded-xl border border-line bg-surface px-2.5 py-[9px]",
                          selected && "border-primary bg-primary-soft shadow-[0_0_0_1px_var(--blue)]",
                        )}
                      >
                        <b className="font-mono font-medium">{candidate.time}</b>
                        <small className="text-[0.72rem] text-muted-foreground">
                          {languageName(candidate.language, locale)} ·{" "}
                          <span className={cn(seats.low && "text-warn")}>{seats.text}</span>
                        </small>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : days.size > 0 ? (
            <p className="text-[0.84rem] text-muted-foreground">{text.chooseDay}</p>
          ) : null}

          {session ? (
            <TicketPicker
              key={session.id}
              locale={locale}
              slug={product.slug}
              sessionId={session.id}
              free={session.free}
              tickets={product.tickets}
            />
          ) : null}
        </aside>
      </div>
    </article>
  );
}

function MonthLink({ href, label, children }: { href: string | null; label: string; children: React.ReactNode }) {
  const classes = "grid size-9 place-items-center rounded-lg border border-line bg-surface";
  if (!href) {
    return (
      <span aria-hidden="true" className={cn(classes, "text-[#c3cbd4]")}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} scroll={false} prefetch={false} aria-label={label} className={cn(classes, "hover:bg-surface-2")}>
      {children}
    </Link>
  );
}
