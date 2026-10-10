import "server-only";

import { cache } from "react";
import { connection } from "next/server";
import { addDays, format, parseISO } from "date-fns";

import { createAdminClient } from "@/lib/db/admin";
import { toBusinessDateTime } from "@/lib/domain/calendar";
import { localizedText, type Locale } from "@/lib/domain/i18n";
import type { LegalInfo } from "@/lib/domain/legal";
import { minPrice, productPhotoUrl } from "@/lib/domain/product";
import { businessToday, GENERATION_DAYS, localToInstant } from "@/lib/domain/schedule";
import { distinctLanguages, isWebBookable, type WebSession } from "@/lib/domain/storefront";
import { getPublicEnv } from "@/lib/env";

/*
 * La web pública no tiene sesión: anon no ve nada en la BD (RLS). Lee el catálogo desde el
 * servidor con service role y solo devuelve lo que puede ver cualquiera: productos a la venta,
 * precios y plazas libres. Nunca datos de reservas o clientes.
 */

export type SiteInfo = { businessName: string; phone: string; email: string; cutoffHours: number; cancelHours: number };

export const loadSite = cache(async (): Promise<SiteInfo> => {
  // Plazas y precios cambian a cada momento: la web se genera en cada visita, nunca en el build.
  await connection();
  const { data, error } = await createAdminClient()
    .from("settings")
    .select("business_name, phone, email, cutoff_hours, cancel_hours")
    .eq("id", 1)
    .single();
  if (error) throw new Error("No se pudieron cargar los ajustes.");
  return {
    businessName: data.business_name,
    phone: data.phone,
    email: data.email,
    cutoffHours: data.cutoff_hours,
    cancelHours: data.cancel_hours,
  };
});

/** Datos del titular para los textos legales (privacidad, condiciones). */
export const loadLegalInfo = cache(async (): Promise<LegalInfo> => {
  await connection();
  const { data, error } = await createAdminClient()
    .from("settings")
    .select("business_name, legal_name, tax_id, address, email, phone, cancel_hours, customer_retention_months")
    .eq("id", 1)
    .single();
  if (error) throw new Error("No se pudieron cargar los ajustes.");
  return {
    businessName: data.business_name,
    legalName: data.legal_name,
    taxId: data.tax_id,
    address: data.address,
    email: data.email,
    phone: data.phone,
    cancelHours: data.cancel_hours,
    retentionMonths: data.customer_retention_months,
  };
});

export type WebTicket = { id: string; name: string; note: string; takesSeat: boolean; priceCents: number };

export type WebProduct = {
  id: string;
  slug: string;
  name: string;
  description: string;
  meetingPoint: string;
  place: string;
  durationMin: number;
  capacity: number;
  pickup: boolean;
  color: string;
  photoUrl: string | null;
  languages: string[];
  fromCents: number;
  tickets: WebTicket[];
};

const PRODUCT_FIELDS =
  "id, slug, name, description, meeting_point, name_en, description_en, meeting_point_en, place, duration_min, capacity, pickup, color, photo_path, product_prices(ticket_type_id, price_cents), schedule_rules(language, valid_to)";

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  meeting_point: string;
  name_en: string;
  description_en: string;
  meeting_point_en: string;
  place: string;
  duration_min: number;
  capacity: number;
  pickup: boolean;
  color: string;
  photo_path: string | null;
  product_prices: { ticket_type_id: string; price_cents: number }[];
  schedule_rules: { language: string; valid_to: string | null }[];
};

async function loadTicketTypes() {
  const { data, error } = await createAdminClient()
    .from("ticket_types")
    .select("id, name, note, name_en, note_en, takes_seat")
    .order("sort")
    .order("created_at");
  if (error) throw new Error("No se pudieron cargar las entradas.");
  return data;
}

/** Producto para la web en un idioma: los textos en inglés que falten se ven en español. */
function toWebProduct(row: ProductRow, ticketTypes: Awaited<ReturnType<typeof loadTicketTypes>>, locale: Locale): WebProduct {
  const { supabaseUrl } = getPublicEnv();
  const today = businessToday();
  const tickets = ticketTypes.flatMap((ticketType): WebTicket[] => {
    const price = row.product_prices.find((candidate) => candidate.ticket_type_id === ticketType.id);
    return price
      ? [
          {
            id: ticketType.id,
            name: localizedText(locale, ticketType.name, ticketType.name_en),
            note: localizedText(locale, ticketType.note, ticketType.note_en),
            takesSeat: ticketType.takes_seat,
            priceCents: price.price_cents,
          },
        ]
      : [];
  });
  return {
    id: row.id,
    slug: row.slug,
    name: localizedText(locale, row.name, row.name_en),
    description: localizedText(locale, row.description, row.description_en),
    meetingPoint: localizedText(locale, row.meeting_point, row.meeting_point_en),
    place: row.place,
    durationMin: row.duration_min,
    capacity: row.capacity,
    pickup: row.pickup,
    color: row.color,
    photoUrl: row.photo_path ? productPhotoUrl(supabaseUrl, row.photo_path) : null,
    // Solo los idiomas de reglas que siguen vigentes.
    languages: distinctLanguages(
      row.schedule_rules.filter((rule) => !rule.valid_to || rule.valid_to >= today).map((rule) => rule.language),
    ),
    fromCents: minPrice(tickets),
    tickets,
  };
}

/** Productos a la venta para el listado, en el orden del panel. */
export async function loadWebProducts(locale: Locale): Promise<WebProduct[]> {
  const [{ data, error }, ticketTypes] = await Promise.all([
    createAdminClient()
      .from("products")
      .select(PRODUCT_FIELDS)
      .eq("active", true)
      .order("created_at")
      .order("name"),
    loadTicketTypes(),
  ]);
  if (error) throw new Error("No se pudieron cargar las experiencias.");
  return data.map((row) => toWebProduct(row, ticketTypes, locale)).filter(isSellable);
}

/** Se puede comprar si vende alguna entrada con plaza (create_booking_hold exige al menos una). */
function isSellable(product: WebProduct): boolean {
  return product.tickets.some((ticket) => ticket.takesSeat);
}

/** Un producto a la venta por su slug, o null. Compartido entre la página y sus metadatos. */
export const loadWebProduct = cache(async (slug: string, locale: Locale): Promise<WebProduct | null> => {
  const [{ data, error }, ticketTypes] = await Promise.all([
    createAdminClient()
      .from("products")
      .select(PRODUCT_FIELDS)
      .eq("slug", slug)
      .eq("active", true)
      .maybeSingle(),
    loadTicketTypes(),
  ]);
  if (error) throw new Error("No se pudo cargar la experiencia.");
  if (!data) return null;
  const product = toWebProduct(data, ticketTypes, locale);
  return isSellable(product) ? product : null;
});

/**
 * Salidas que la web vende de un producto, desde ahora hasta el final de las generadas, con sus
 * plazas libres (vista session_availability, la misma regla que create_booking_hold).
 * PostgREST devuelve como mucho 1000 filas: las dos consultas van por fecha para que, en un
 * producto con más de 8 salidas al día, solo se pierdan los últimos días y nunca días sueltos.
 */
export async function loadWebSessions(productId: string, cutoffHours: number, now = new Date()): Promise<WebSession[]> {
  const from = new Date(Math.max(now.getTime(), now.getTime() + cutoffHours * 3_600_000)).toISOString();
  const lastDay = format(addDays(parseISO(businessToday(now)), GENERATION_DAYS + 1), "yyyy-MM-dd");
  const to = localToInstant(lastDay, "00:00").toISOString();
  const supabase = createAdminClient();
  const [{ data: sessions, error }, { data: availability, error: availabilityError }] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, starts_at, language, status")
      .eq("product_id", productId)
      .eq("status", "open")
      .gte("starts_at", from)
      .lt("starts_at", to)
      .order("starts_at"),
    supabase
      .from("session_availability")
      .select("session_id, free_seats")
      .eq("product_id", productId)
      .gte("starts_at", from)
      .lt("starts_at", to)
      .order("starts_at"),
  ]);
  if (error || availabilityError) throw new Error("No se pudieron cargar las salidas.");
  const free = new Map(availability.map((row) => [row.session_id, row.free_seats ?? 0]));
  return sessions
    .map((session): WebSession => {
      const { date, time } = toBusinessDateTime(session.starts_at);
      return {
        id: session.id,
        date,
        time,
        language: session.language,
        status: session.status as WebSession["status"],
        startsAt: new Date(session.starts_at),
        free: free.get(session.id) ?? 0,
      };
    })
    .filter((session) => isWebBookable(session, now, cutoffHours));
}

/** Una salida de un producto si la web la vende ahora mismo, o null. */
export async function loadWebSession(
  productId: string,
  sessionId: string,
  cutoffHours: number,
  now = new Date(),
): Promise<WebSession | null> {
  const supabase = createAdminClient();
  const [{ data: session, error }, { data: availability, error: availabilityError }] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, starts_at, language, status")
      .eq("id", sessionId)
      .eq("product_id", productId)
      .maybeSingle(),
    supabase.from("session_availability").select("free_seats").eq("session_id", sessionId).maybeSingle(),
  ]);
  if (error || availabilityError) throw new Error("No se pudo cargar la salida.");
  if (!session) return null;
  const { date, time } = toBusinessDateTime(session.starts_at);
  const web: WebSession = {
    id: session.id,
    date,
    time,
    language: session.language,
    status: session.status as WebSession["status"],
    startsAt: new Date(session.starts_at),
    free: availability?.free_seats ?? 0,
  };
  return isWebBookable(web, now, cutoffHours) ? web : null;
}
