import "server-only";

import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheck, CircleX, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { createAdminClient } from "@/lib/db/admin";
import { longDayLabel, toBusinessDateTime } from "@/lib/domain/calendar";
import { formatCents } from "@/lib/domain/money";
import { localizedPath, localizedText } from "@/lib/domain/i18n";
import { hasRecentBooking, RECENT_BOOKINGS_COOKIE } from "@/lib/domain/web-checkout";
import { languageName, webText } from "@/lib/domain/web-text";
import { getLocale } from "@/lib/i18n";

import { loadSite } from "../../data";

export async function generateMetadata(): Promise<Metadata> {
  return { title: webText(await getLocale()).confirmedTitle, robots: { index: false } };
}

const CODE = /^VT[0-9A-Z]{6}$/;

/**
 * Confirmación de una reserva web. Tiene datos del cliente, así que solo la ve el navegador que
 * la hizo (cookie httpOnly con sus últimas reservas); con el código solo, da 404.
 */
export default async function ConfirmationPage({ params }: PageProps<"/reserva/[codigo]">) {
  const { codigo } = await params;
  if (!CODE.test(codigo)) notFound();

  const [site, locale, { data: booking, error }] = await Promise.all([
    loadSite(),
    getLocale(),
    createAdminClient()
      .from("bookings")
      .select(
        "id, code, status, payment_status, total_cents, hotel, sessions(starts_at, language, products(name, meeting_point, name_en, meeting_point_en, pickup)), booking_lines(qty, ticket_types(name, name_en, sort))",
      )
      .eq("code", codigo)
      .eq("channel", "web")
      .maybeSingle(),
  ]);
  if (error) throw new Error("No se pudo cargar la reserva.");
  const jar = await cookies();
  if (!booking || !hasRecentBooking(jar.get(RECENT_BOOKINGS_COOKIE)?.value, booking.id)) notFound();
  const session = booking.sessions;
  const product = session?.products;
  if (!session || !product) notFound();

  const { date, time } = toBusinessDateTime(session.starts_at);
  const text = webText(locale);
  const language = languageName(session.language, locale);
  const lines = [...booking.booking_lines].sort((a, b) => (a.ticket_types?.sort ?? 0) - (b.ticket_types?.sort ?? 0));
  const cancelled = booking.status === "cancelled" || booking.status === "expired";
  const productName = localizedText(locale, product.name, product.name_en);
  const meetingPoint = localizedText(locale, product.meeting_point, product.meeting_point_en);
  const place = product.pickup && booking.hotel ? text.pickupAt(booking.hotel) : meetingPoint;

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col gap-3.5 px-4 py-[22px]">
      <div className="flex flex-col items-center gap-1 text-center">
        {cancelled ? (
          <CircleX aria-hidden="true" className="size-12 text-muted-foreground" />
        ) : (
          <CircleCheck aria-hidden="true" className="size-12 text-ok" />
        )}
        <h1 className="text-[1.4rem]">{cancelled ? text.cancelledHeading : text.confirmedHeading}</h1>
        {!cancelled ? (
          <p className="text-muted-foreground">{text.keepCode}</p>
        ) : null}
      </div>

      <section
        aria-label={text.yourBooking}
        className="flex flex-col gap-2.5 rounded-xl border-[1.5px] border-dashed border-[#a9c0f0] bg-primary-soft p-[18px]"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[0.68rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">{text.bookingCode}</div>
            <div className="font-mono text-[1.5rem] font-medium tracking-[0.06em]">{booking.code}</div>
          </div>
          {cancelled ? (
            <Pill>{text.cancelled}</Pill>
          ) : booking.payment_status === "paid" ? (
            <Pill tone="ok">{text.paid}</Pill>
          ) : (
            <Pill tone="warn">{text.payThere}</Pill>
          )}
        </div>
        <div>
          <b className="font-semibold">{productName}</b>
          <p className="text-[0.86rem]">
            <span className="inline-block first-letter:uppercase">{longDayLabel(date, locale)}</span> ·{" "}
            <span className="font-mono">{time}</span> · {language}
          </p>
          {place ? (
            <p className="mt-0.5 flex items-start gap-1 text-[0.84rem] text-muted-foreground">
              <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {place}
            </p>
          ) : null}
        </div>
        <div className="flex justify-between gap-2.5">
          <span>{lines
              .map((line) => `${line.qty} ${line.ticket_types ? localizedText(locale, line.ticket_types.name, line.ticket_types.name_en) : ""}`)
              .join(" · ")}</span>
          <b className="tabular-nums">{formatCents(booking.total_cents, locale)}</b>
        </div>
      </section>

      {!cancelled ? (
        <p className="text-center text-[0.84rem] text-muted-foreground">
          {text.payTotalOnTheDay}
          {site.cancelHours > 0 ? ` ${text.freeCancellationBeforeStart(site.cancelHours)}` : ""}
          {site.phone ? ` ${text.callForChanges(site.phone)}` : ""}
        </p>
      ) : null}
      <div className="flex justify-center">
        <Button asChild variant="outline">
          <Link href={localizedPath(locale, "/")}>{text.backHome}</Link>
        </Button>
      </div>
    </div>
  );
}
