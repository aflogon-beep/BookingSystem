import "server-only";

import { createClient } from "@/lib/db/server";
import type { AssignableResource } from "@/lib/domain/assignment";
import { toBusinessDateTime } from "@/lib/domain/calendar";
import type { ManifestBooking } from "@/lib/domain/manifest";
import { isResourceType, needsFromRows, type ProductNeeds } from "@/lib/domain/resources";

export type ManifestSession = {
  id: string;
  startsAt: string;
  date: string;
  time: string;
  endTime: string;
  language: string;
  status: "open" | "closed" | "cancelled";
  capacity: number;
  booked: number;
  started: boolean;
  product: { name: string; color: string; minPax: number; meetingPoint: string; pickup: boolean };
};

export type ManifestRow = ManifestBooking & { notes: string; channel: string; agent: string };

/** Equipo de la salida: lo que pide el producto, lo asignado y todos los recursos para elegir. */
export type ManifestEquipment = {
  needs: ProductNeeds;
  assignedIds: string[];
  resources: AssignableResource[];
  /** Recursos asignados a otra salida que se solapa con esta. */
  busyIds: string[];
};

const STATUSES = new Set<ManifestSession["status"]>(["open", "closed", "cancelled"]);

/** Salida con su ocupación y sus reservas (sin las web caducadas, que nunca llegaron a confirmarse). */
export async function loadManifest(sessionId: string, now: Date): Promise<{ session: ManifestSession; bookings: ManifestRow[]; equipment: ManifestEquipment } | null> {
  const supabase = await createClient();
  const [{ data: row, error }, { data: availability, error: availabilityError }, { data: bookings, error: bookingsError }] =
    await Promise.all([
      supabase
        .from("sessions")
        .select("id, product_id, starts_at, ends_at, language, status, capacity, products!inner(name, color, min_pax, meeting_point, pickup)")
        .eq("id", sessionId)
        .maybeSingle(),
      supabase.from("session_availability").select("booked_seats").eq("session_id", sessionId).maybeSingle(),
      supabase
        .from("bookings")
        .select(
          "id, code, status, payment_status, total_cents, checked_in, hotel, notes, channel, agent, customers!inner(name, phone, email), booking_lines(qty, ticket_types!inner(name, sort))",
        )
        .eq("session_id", sessionId)
        .in("status", ["confirmed", "cancelled"]),
    ]);
  if (error || availabilityError || bookingsError) throw new Error("No se pudo cargar el manifiesto.");
  if (!row) return null;
  // Las web que nunca se pagaron (bloqueo caducado o salida cancelada) no son pasajeros.
  const passengers = bookings.filter(
    (booking) => !(booking.channel === "web" && booking.status === "cancelled" && booking.payment_status === "pending"),
  );

  const equipment = await loadEquipment(row);

  const { date, time } = toBusinessDateTime(row.starts_at);
  return {
    equipment,
    session: {
      id: row.id,
      startsAt: row.starts_at,
      date,
      time,
      endTime: toBusinessDateTime(row.ends_at).time,
      language: row.language,
      status: STATUSES.has(row.status as ManifestSession["status"]) ? (row.status as ManifestSession["status"]) : "closed",
      capacity: row.capacity,
      booked: availability?.booked_seats ?? 0,
      started: new Date(row.starts_at) <= now,
      product: {
        name: row.products.name,
        color: row.products.color,
        minPax: row.products.min_pax,
        meetingPoint: row.products.meeting_point,
        pickup: row.products.pickup,
      },
    },
    bookings: passengers.map((booking) => ({
      id: booking.id,
      code: booking.code,
      status: booking.status,
      paymentStatus: booking.payment_status,
      totalCents: booking.total_cents,
      checkedIn: booking.checked_in,
      customerName: booking.customers.name,
      phone: booking.customers.phone ?? "",
      email: booking.customers.email ?? "",
      hotel: booking.hotel,
      notes: booking.notes,
      channel: booking.channel,
      agent: booking.agent,
      lines: [...booking.booking_lines]
        .sort((a, b) => a.ticket_types.sort - b.ticket_types.sort)
        .map((line) => ({ ticketName: line.ticket_types.name, qty: line.qty })),
    })),
  };
}

async function loadEquipment(session: { id: string; product_id: string; starts_at: string; ends_at: string }): Promise<ManifestEquipment> {
  const supabase = await createClient();
  const period = `[${session.starts_at},${session.ends_at})`;
  const [needs, assigned, resources, busy] = await Promise.all([
    supabase.from("product_needs").select("resource_type, qty").eq("product_id", session.product_id),
    supabase.from("session_resources").select("resource_id").eq("session_id", session.id).order("created_at").order("resource_id"),
    supabase.from("resources").select("id, name, type, seats, languages").order("created_at").order("id"),
    supabase.from("session_resources").select("resource_id").neq("session_id", session.id).overlaps("period", period),
  ]);
  if (needs.error || assigned.error || resources.error || busy.error) throw new Error("No se pudo cargar el equipo de la salida.");
  return {
    needs: needsFromRows(needs.data),
    assignedIds: assigned.data.map((item) => item.resource_id),
    resources: resources.data.flatMap((item) => (isResourceType(item.type) ? [{ ...item, type: item.type }] : [])),
    busyIds: [...new Set(busy.data.map((item) => item.resource_id))],
  };
}
