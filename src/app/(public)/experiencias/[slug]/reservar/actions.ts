"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createAdminClient } from "@/lib/db/admin";
import { isSlug } from "@/lib/domain/storefront";
import {
  addRecentBooking,
  RECENT_BOOKINGS_COOKIE,
  resolveCart,
  webBookingErrorMessage,
  webCustomerSchema,
  type WebCustomerInput,
} from "@/lib/domain/web-checkout";

import { loadSite, loadWebProduct, loadWebSession } from "../../../data";

const requestSchema = z.object({
  slug: z.string().refine(isSlug),
  sessionId: z.uuid(),
  lines: z
    .array(z.object({ ticketTypeId: z.uuid(), qty: z.int().min(1).max(100) }))
    .min(1)
    .max(20)
    .refine((lines) => new Set(lines.map((line) => line.ticketTypeId)).size === lines.length),
  // Total que el cliente ha visto al confirmar: si el precio cambia entre medias, no se reserva.
  expectedTotalCents: z.int().min(0),
});

export type WebBookingInput = z.input<typeof requestSchema> & { customer: WebCustomerInput };

const createdSchema = z.object({ id: z.uuid(), code: z.string().regex(/^VT[0-9A-Z]{6}$/) });

/**
 * Reserva desde la web sin pasarela de pago: queda confirmada y se paga el día del tour. Plazas,
 * precios, cierre de venta y total los vuelve a decidir create_booking_hold con la salida bloqueada.
 * Si sale bien, lleva a la confirmación (solo la ve este navegador).
 */
export async function createWebBooking(input: WebBookingInput): Promise<{ ok: false; error: string }> {
  const request = requestSchema.safeParse(input);
  if (!request.success) return { ok: false, error: "Revisa las entradas elegidas." };
  const customer = webCustomerSchema.safeParse(input.customer);
  if (!customer.success) {
    const issue = customer.error.issues[0];
    // El campo trampa no explica nada: a un bot no hay que darle pistas.
    if (!issue || issue.path[0] === "trap") return { ok: false, error: "No se pudo completar la reserva." };
    return { ok: false, error: issue.message };
  }

  const { slug, sessionId, lines, expectedTotalCents } = request.data;
  const site = await loadSite();
  const product = await loadWebProduct(slug);
  const session = product ? await loadWebSession(product.id, sessionId, site.cutoffHours) : null;
  if (!product || !session) return { ok: false, error: webBookingErrorMessage("RB002", undefined) };
  const cart = resolveCart(product.tickets, lines, session.free);
  if (!cart.ok) return { ok: false, error: cart.error };
  if (cart.totalCents !== expectedTotalCents) {
    return { ok: false, error: "El precio ha cambiado. Vuelve a elegir las entradas para ver el total actualizado." };
  }

  const { name, email, phone, hotel } = customer.data;
  const { data, error } = await createAdminClient().rpc("create_booking_hold", {
    p_session_id: session.id,
    p_lines: lines.map((line) => ({ ticket_type_id: line.ticketTypeId, qty: line.qty })),
    p_customer: { name, email, phone },
    p_booking: { channel: "web", payment: "on_site", hotel: product.pickup ? hotel : "" },
  });
  if (error) return { ok: false, error: webBookingErrorMessage(error.code, error.hint) };
  const created = createdSchema.safeParse(data);
  if (!created.success) return { ok: false, error: webBookingErrorMessage(undefined, undefined) };

  const jar = await cookies();
  jar.set(RECENT_BOOKINGS_COOKIE, addRecentBooking(jar.get(RECENT_BOOKINGS_COOKIE)?.value, created.data.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect(`/reserva/${created.data.code}`);
}
