import { icsFile } from "@/lib/domain/add-to-calendar";
import { localizedText } from "@/lib/domain/i18n";
import { webText } from "@/lib/domain/web-text";
import { getLocale } from "@/lib/i18n";

import { loadOwnWebBooking } from "../booking";

/** «Apple, Outlook…» en la confirmación: la reserva como archivo .ics (mismo acceso que la página). */
export async function GET(_request: Request, { params }: RouteContext<"/reserva/[codigo]/calendario">) {
  const { codigo } = await params;
  const [locale, own] = await Promise.all([getLocale(), loadOwnWebBooking(codigo)]);
  if (!own || own.booking.status === "cancelled" || own.booking.status === "expired") {
    return new Response("Not found", { status: 404 });
  }
  const { booking, session, product } = own;
  const text = webText(locale);
  const meetingPoint = localizedText(locale, product.meeting_point, product.meeting_point_en);
  const ics = icsFile({
    uid: booking.code,
    title: localizedText(locale, product.name, product.name_en),
    start: session.starts_at,
    end: session.ends_at,
    location: product.pickup && booking.hotel ? text.pickupAt(booking.hotel) : meetingPoint,
    details: text.calendarDetails(booking.code),
  });
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${booking.code}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
