import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Backpack,
  Bus,
  CalendarCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  Info,
  Languages,
  MapPin,
  Mountain,
  Navigation,
  Sparkles,
  Users,
  X,
} from "lucide-react";

import { ProductArt } from "@/components/productos/product-art";
import { BookBar } from "@/components/web/book-bar";
import { ProductGallery } from "@/components/web/product-gallery";
import { TicketPicker } from "@/components/web/ticket-picker";
import { longDayLabel } from "@/lib/domain/calendar";
import { formatCents, formatWholeEuros } from "@/lib/domain/money";
import { durationLabel } from "@/lib/domain/product";
import { DIFFICULTY_TEXT, mapsUrl, pageSections, type PageSection } from "@/lib/domain/product-page";
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
  const locale = await getLocale();
  const [site, product] = await Promise.all([loadSite(), isSlug(slug) ? loadWebProduct(slug, locale) : null]);
  if (!product) return { title: site.businessName };
  return { title: `${product.name} · ${site.businessName}`, description: product.description.slice(0, 160) || undefined };
}

export default async function ProductPage({ params, searchParams }: PageProps<"/experiencias/[slug]">) {
  const { slug } = await params;
  if (!isSlug(slug)) notFound();
  const locale = await getLocale();
  const [site, product] = await Promise.all([loadSite(), loadWebProduct(slug, locale)]);
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

  const content = product.content;
  const sections = pageSections(content, product.description, product.meetingPoint);
  const has = (section: PageSection) => sections.includes(section);
  const nav = [
    { id: "resumen", label: text.overview, show: has("highlights") || has("description") },
    { id: "itinerario", label: text.itinerary, show: has("itinerary") },
    { id: "incluye", label: text.includes, show: has("included") },
    { id: "encuentro", label: text.meetingPoint, show: has("meeting") },
    { id: "info", label: text.goodToKnowShort, show: has("bring") || has("goodToKnow") },
  ].filter((item) => item.show);
  const paragraphs = product.description.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const facts = [
    { icon: Clock, label: text.duration, value: durationLabel(product.durationMin) },
    product.languages.length
      ? { icon: Languages, label: text.languagesLabel, value: product.languages.map((code) => languageName(code, locale)).join(", ") }
      : null,
    { icon: Users, label: text.group, value: text.maxPeople(product.capacity) },
    product.pickup ? { icon: Bus, label: text.hotelPickup, value: null } : null,
    content.difficulty ? { icon: Mountain, label: text.difficulty, value: DIFFICULTY_TEXT[locale][content.difficulty] } : null,
  ].filter((fact) => fact !== null);

  const backLink = (
    <Link
      href={href("/")}
      className="absolute top-3 left-3 z-10 inline-flex items-center gap-1 rounded-full bg-white/92 px-3 py-1.5 text-[0.8rem] font-medium text-foreground shadow-[0_4px_14px_rgb(0_0_0/0.15)] backdrop-blur-sm hover:bg-white tablet:top-4 tablet:left-4"
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      {text.experiences}
    </Link>
  );

  return (
    <article className="pb-[84px] desk:pb-0">
      <div className="relative mx-auto w-full max-w-6xl tablet:px-[22px] tablet:pt-[22px]">
        {product.photoUrls.length ? (
          <ProductGallery photos={product.photoUrls} name={product.name} locale={locale}>
            {backLink}
          </ProductGallery>
        ) : (
          <div className="relative overflow-hidden tablet:rounded-[22px]">
            <ProductArt seed={product.id} color={product.color} photoUrl={null} className="h-[220px] tablet:h-[340px]" priority />
            {backLink}
          </div>
        )}
      </div>

      <header className="mx-auto w-full max-w-6xl px-4 pt-5 tablet:px-[22px] tablet:pt-7">
        <div className="flex max-w-3xl flex-col gap-2 animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
          {product.place ? (
            <p className="inline-flex items-center gap-1 text-[0.72rem] font-semibold tracking-[0.08em] text-primary-dark uppercase">
              <Sparkles aria-hidden="true" className="size-3.5" />
              {product.place}
            </p>
          ) : null}
          <h1 className="text-[1.7rem] leading-[1.15] font-bold tracking-[-0.025em] text-balance tablet:text-[2.3rem]">{product.name}</h1>
          {content.tagline ? <p className="text-[1.02rem] text-pretty text-muted-foreground tablet:text-[1.15rem]">{content.tagline}</p> : null}
        </div>
        <ul aria-label={text.details} className="mt-4 flex flex-wrap gap-2">
          {facts.map((fact) => (
            <li
              key={fact.label}
              className="inline-flex min-w-0 items-center gap-2 rounded-full border border-line bg-surface py-1.5 pr-3.5 pl-1.5 text-[0.84rem]"
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-dark">
                <fact.icon aria-hidden="true" className="size-4" />
              </span>
              {fact.value === null ? (
                <span className="font-medium">{fact.label}</span>
              ) : (
                <span className="min-w-0">
                  <span className="sr-only">{fact.label}: </span>
                  <span className="font-medium">{fact.value}</span>
                </span>
              )}
            </li>
          ))}
          {site.cancelHours > 0 ? (
            <li className="inline-flex items-center gap-2 rounded-full border border-ok/25 bg-ok-soft py-1.5 pr-3.5 pl-1.5 text-[0.84rem] font-medium text-ok">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white">
                <CalendarCheck aria-hidden="true" className="size-4" />
              </span>
              {text.freeCancellationShort}
            </li>
          ) : null}
        </ul>
      </header>

      {nav.length >= 3 ? (
        <nav
          aria-label={text.sections}
          className="sticky top-0 z-20 mt-5 border-b border-line-2 bg-white/90 backdrop-blur-md desk:hidden"
        >
          <ul className="mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto px-4 [scrollbar-width:none] tablet:px-[22px]">
            {nav.map((item) => (
              <li key={item.id} className="shrink-0">
                <a
                  href={`#${item.id}`}
                  className="flex min-h-11 items-center px-2.5 text-[0.84rem] font-medium whitespace-nowrap text-muted-foreground hover:text-foreground"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-start gap-[26px] px-4 py-[22px] tablet:px-[22px] desk:grid-cols-[minmax(0,1fr)_360px] desk:gap-10">
        <div className="flex min-w-0 flex-col gap-8">
          {has("highlights") || has("description") ? (
            <section id="resumen" aria-labelledby="resumen-titulo" className="flex scroll-mt-16 flex-col gap-5">
              <h2 id="resumen-titulo" className="sr-only">
                {text.overview}
              </h2>
              {has("highlights") ? (
                <div className="rounded-[20px] bg-[linear-gradient(135deg,#eef6ff,#f6f1ff)] p-5 tablet:p-6">
                  <h3 className="mb-3 inline-flex items-center gap-2 text-[1.05rem] font-semibold">
                    <Sparkles aria-hidden="true" className="size-5 text-primary" />
                    {text.highlights}
                  </h3>
                  <ul className="grid gap-x-6 gap-y-2.5 tablet:grid-cols-2">
                    {content.highlights.map((highlight) => (
                      <li key={highlight} className="flex items-start gap-2.5 text-[0.95rem]">
                        <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary text-white">
                          <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
                        </span>
                        {highlight}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {paragraphs.length ? (
                <div className="flex flex-col gap-3">
                  <h3 className="text-[1.2rem] font-semibold">{text.about}</h3>
                  {paragraphs.map((paragraph, index) => (
                    <p key={index} className="text-[0.98rem] leading-relaxed whitespace-pre-line text-[#2a3644]">
                      {paragraph}
                    </p>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          {has("itinerary") ? (
            <section id="itinerario" aria-labelledby="itinerario-titulo" className="scroll-mt-16">
              <h2 id="itinerario-titulo" className="mb-4 text-[1.2rem] font-semibold">
                {text.itinerary}
              </h2>
              <ol className="relative flex flex-col">
                {content.stops.map((stop, index) => {
                  const last = index === content.stops.length - 1;
                  return (
                    <li key={index} className="relative flex gap-4 pb-6 last:pb-0">
                      <div aria-hidden="true" className="flex flex-col items-center">
                        <span
                          className={cn(
                            "grid size-9 shrink-0 place-items-center rounded-full text-[0.86rem] font-bold shadow-[0_0_0_4px_var(--surface)]",
                            index === 0 || last ? "bg-primary text-white" : "border-2 border-primary bg-surface text-primary-dark",
                          )}
                        >
                          {index === 0 ? <MapPin className="size-4" /> : last ? <Flag className="size-4" /> : index + 1}
                        </span>
                        {last ? null : <span className="mt-1 w-0.5 flex-1 rounded-full bg-[linear-gradient(var(--blue),#c9def5)]" />}
                      </div>
                      <div className="min-w-0 flex-1 pt-1.5">
                        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                          <h3 className="text-[1rem] font-semibold">{stop.title}</h3>
                          {stop.durationMin ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[0.74rem] font-medium text-muted-foreground">
                              <Clock aria-hidden="true" className="size-3" />
                              {durationLabel(stop.durationMin)}
                            </span>
                          ) : null}
                        </div>
                        {stop.description ? (
                          <p className="mt-1 text-[0.92rem] leading-relaxed text-muted-foreground">{stop.description}</p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ) : null}

          {has("included") ? (
            <section id="incluye" aria-labelledby="incluye-titulo" className="scroll-mt-16">
              <h2 id="incluye-titulo" className="mb-4 text-[1.2rem] font-semibold">
                {text.includes}
              </h2>
              <div className="grid gap-4 tablet:grid-cols-2">
                {content.included.length ? (
                  <div className="rounded-2xl border border-line p-4">
                    <h3 className="mb-2.5 text-[0.72rem] font-semibold tracking-[0.08em] text-ok uppercase">{text.included}</h3>
                    <ul className="flex flex-col gap-2">
                      {content.included.map((item) => (
                        <li key={item} className="flex items-start gap-2.5 text-[0.93rem]">
                          <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ok" strokeWidth={3} />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {content.notIncluded.length ? (
                  <div className="rounded-2xl border border-line p-4">
                    <h3 className="mb-2.5 text-[0.72rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                      {text.notIncluded}
                    </h3>
                    <ul className="flex flex-col gap-2">
                      {content.notIncluded.map((item) => (
                        <li key={item} className="flex items-start gap-2.5 text-[0.93rem] text-muted-foreground">
                          <X aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-danger" strokeWidth={3} />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {has("meeting") ? (
            <section id="encuentro" aria-labelledby="encuentro-titulo" className="scroll-mt-16">
              <h2 id="encuentro-titulo" className="mb-4 text-[1.2rem] font-semibold">
                {text.meetingPoint}
              </h2>
              <div className="flex flex-col gap-3 overflow-hidden rounded-2xl border border-line bg-[radial-gradient(circle_at_85%_20%,#e3f0ff,transparent_55%),var(--surface)] p-4 tablet:flex-row tablet:items-center tablet:justify-between">
                <p className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-white shadow-[0_6px_16px_rgb(0_113_227/0.35)]">
                    <MapPin aria-hidden="true" className="size-5" />
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5 pt-0.5">
                    <b className="font-semibold">{product.meetingPoint}</b>
                    {product.pickup ? <span className="text-[0.84rem] text-muted-foreground">{text.pickupNote}</span> : null}
                  </span>
                </p>
                <a
                  href={mapsUrl(product.meetingPoint)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 self-start rounded-full border border-line bg-surface px-3.5 py-2 text-[0.84rem] font-medium hover:bg-surface-2 tablet:self-auto"
                >
                  <Navigation aria-hidden="true" className="size-4 text-primary" />
                  {text.openMaps}
                </a>
              </div>
            </section>
          ) : null}

          {has("bring") || has("goodToKnow") ? (
            <section id="info" aria-labelledby="info-titulo" className="flex scroll-mt-16 flex-col gap-4">
              <h2 id="info-titulo" className="sr-only">
                {text.goodToKnowShort}
              </h2>
              {has("bring") ? (
                <div>
                  <h3 className="mb-3 text-[1.2rem] font-semibold">{text.bring}</h3>
                  <ul className="flex flex-wrap gap-2">
                    {content.bring.map((item) => (
                      <li
                        key={item}
                        className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-[0.86rem] font-medium"
                      >
                        <Backpack aria-hidden="true" className="size-4 text-muted-foreground" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {has("goodToKnow") ? (
                <div className="flex gap-3 rounded-2xl border border-[#f5dfb8] bg-[#fff8ec] p-4">
                  <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warn" />
                  <div className="min-w-0">
                    <h3 className="mb-1 font-semibold">{text.goodToKnow}</h3>
                    <p className="text-[0.92rem] leading-relaxed whitespace-pre-line text-[#4a3b1f]">{content.goodToKnow}</p>
                  </div>
                </div>
              ) : null}
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
          id="reservar"
          aria-label={text.book}
          className="flex scroll-mt-14 flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-[0_12px_32px_rgb(16_24_40/0.1)] desk:sticky desk:top-5"
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

      {/* Móvil: barra fija para llegar al calendario desde cualquier parte de la ficha. */}
      <BookBar targetId="reservar">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-2.5 tablet:px-[22px]">
          {product.fromCents > 0 ? (
            <p className="flex min-w-0 flex-col leading-tight">
              <span className="text-[0.74rem] text-muted-foreground">{text.from}</span>
              <b className="text-[1.15rem] font-semibold">{formatCents(product.fromCents, locale)}</b>
            </p>
          ) : (
            <span />
          )}
          <a
            href="#reservar"
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-primary px-5 text-[0.92rem] font-semibold text-white shadow-[0_6px_16px_rgb(0_113_227/0.35)] hover:bg-primary-dark"
          >
            {text.checkDates}
          </a>
        </div>
      </BookBar>
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
