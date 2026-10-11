"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";

import { createAdminClient } from "@/lib/db/admin";
import { isAvailabilityError } from "@/lib/domain/booking-form";
import { webBookingRules } from "@/lib/domain/rate-limits";
import { sendBookingConfirmation } from "@/lib/email/booking-emails";
import { DEFAULT_LOCALE, isLocale, localizedPath, type Locale } from "@/lib/domain/i18n";
import { isSlug } from "@/lib/domain/storefront";
import {
  addRecentBooking,
  RECENT_BOOKINGS_COOKIE,
  resolveCart,
  webBookingErrorMessage,
  webCustomerSchemaFor,
  type WebCustomerInput,
} from "@/lib/domain/web-checkout";
import { webText } from "@/lib/domain/web-text";
import { requestIp, withinLimits } from "@/lib/rate-limit";

import { loadSite, loadWebProduct, loadWebSession } from "../../../data";

const requestSchema = z.object({
  slug: z.string().refine(isSlug),
  sessionId: z.uuid(),
  // Identificador de este envío del formulario: si se repite, no se crea otra reserva.
  requestId: z.uuid(),
  lines: z
    .array(z.object({ ticketTypeId: z.uuid(), qty: z.int().min(1).max(100) }))
    .min(1)
    .max(20)
    .refine((lines) => new Set(lines.map((line) => line.ticketTypeId)).size === lines.length),
  // Total que el cliente ha visto al confirmar: si el precio cambia entre medias, no se reserva.
  expectedTotalCents: z.int().min(0),
});

export type WebBookingInput = z.input<typeof requestSchema> & { locale: Locale; customer: WebCustomerInput };

const createdSchema = z.object({
  id: z.uuid(),
  code: z.string().regex(/^VT[0-9A-Z]{6}$/),
  replayed: z.boolean().optional().default(false),
});

/**
 * Reserva desde la web sin pasarela de pago: queda confirmada y se paga el día del tour. Plazas,
 * precios, cierre de venta y total los vuelve a decidir create_booking_hold con la salida bloqueada.
 * Si sale bien, lleva a la confirmación (solo la ve este navegador).
 *
 * Un reintento del mismo formulario (requestId) que ya creó su reserva lleva a esa confirmación,
 * aunque mientras tanto la salida se haya llenado (con esa misma reserva).
 * Si la reserva no entra porque la disponibilidad ha cambiado, se refresca la página para que el
 * cliente vea las plazas reales en lugar de las que tenía en pantalla.
 */
export async function createWebBooking(input: WebBookingInput): Promise<{ ok: false; error: string }> {
  const locale = isLocale(input?.locale) ? input.locale : DEFAULT_LOCALE;
  const text = webText(locale);
  const request = requestSchema.safeParse(input);
  if (!request.success) return { ok: false, error: text.errors.badTickets };
  const customer = webCustomerSchemaFor(locale).safeParse(input.customer);
  if (!customer.success) {
    const issue = customer.error.issues[0];
    // El campo trampa no explica nada: a un bot no hay que darle pistas.
    if (!issue || issue.path[0] === "trap") return { ok: false, error: text.errors.genericShort };
    return { ok: false, error: issue.message };
  }

  const { slug, sessionId, requestId, lines, expectedTotalCents } = request.data;
  const admin = createAdminClient();
  const { data: earlier } = await admin
    .from("bookings")
    .select("id, code")
    .eq("request_id", requestId)
    .eq("session_id", sessionId)
    .eq("channel", "web")
    .maybeSingle();
  if (earlier) return finishBooking(earlier, locale, false);

  const site = await loadSite();
  const product = await loadWebProduct(slug, locale);
  const session = product ? await loadWebSession(product.id, sessionId, site.cutoffHours) : null;
  if (!product || !session) {
    refresh();
    return { ok: false, error: webBookingErrorMessage("RB002", undefined, locale) };
  }
  const cart = resolveCart(product.tickets, lines, session.free, locale);
  if (!cart.ok) {
    refresh();
    return { ok: false, error: cart.error };
  }
  if (cart.totalCents !== expectedTotalCents) return { ok: false, error: text.errors.priceChanged };

  const { name, email, phone, hotel } = customer.data;
  // Sin pago, una reserva solo cuesta un envío: se limitan los intentos por IP y por email.
  const ip = await requestIp();
  if (ip && !(await withinLimits(webBookingRules(ip, email)))) return { ok: false, error: text.errors.tooMany };
  const { data, error } = await admin.rpc("create_booking_hold", {
    p_session_id: session.id,
    p_lines: lines.map((line) => ({ ticket_type_id: line.ticketTypeId, qty: line.qty })),
    p_customer: { name, email, phone },
    p_booking: { channel: "web", payment: "on_site", hotel: product.pickup ? hotel : "", request_id: requestId },
  });
  if (error) {
    if (isAvailabilityError(error.code)) refresh();
    return { ok: false, error: webBookingErrorMessage(error.code, error.hint, locale) };
  }
  const created = createdSchema.safeParse(data);
  if (!created.success) return { ok: false, error: webBookingErrorMessage(undefined, undefined, locale) };
  return finishBooking(created.data, locale, !created.data.replayed);
}

/** Guarda la reserva en la cookie de este navegador y lleva a su confirmación (el email, solo la primera vez). */
async function finishBooking(booking: { id: string; code: string }, locale: Locale, sendEmail: boolean): Promise<never> {
  const jar = await cookies();
  jar.set(RECENT_BOOKINGS_COOKIE, addRecentBooking(jar.get(RECENT_BOOKINGS_COOKIE)?.value, booking.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  // El email sale después de responder: no retrasa la confirmación ni la rompe si falla.
  if (sendEmail) after(() => sendBookingConfirmation(booking.id));
  redirect(localizedPath(locale, `/reserva/${booking.code}`));
}
