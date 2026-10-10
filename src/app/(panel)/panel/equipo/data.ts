import "server-only";

import { createClient } from "@/lib/db/server";
import { missingResources } from "@/lib/domain/assignment";
import { rangeForDays, toBusinessDateTime } from "@/lib/domain/calendar";
import { isResourceType, needsFromRows, type ResourceType } from "@/lib/domain/resources";
import type { DaySession, PlanSession } from "@/lib/domain/whereabouts";
import { sessionPlace } from "@/lib/domain/whereabouts";

export type TeamResource = { id: string; name: string; type: ResourceType; seats: number; languages: string[] };

/** Todos los recursos, en el orden de las fichas. */
export async function loadResources(): Promise<TeamResource[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("resources").select("id, name, type, seats, languages").order("created_at").order("name");
  if (error) throw new Error("No se pudo cargar el equipo.");
  return data.flatMap((row) => (isResourceType(row.type) ? [{ ...row, type: row.type }] : []));
}

/** Salidas no canceladas que empiezan esos días (hora del negocio), con su producto y su equipo. */
async function loadSessions(days: string[]) {
  const supabase = await createClient();
  const range = rangeForDays(days);
  const { data, error } = await supabase
    .from("sessions")
    .select(
      "id, product_id, starts_at, ends_at, language, products!inner(name, color, place, meeting_point), session_resources(resource_id)",
    )
    .neq("status", "cancelled")
    .gte("starts_at", range.from)
    .lt("starts_at", range.to)
    .order("starts_at");
  if (error) throw new Error("No se pudieron cargar las salidas.");
  return data;
}

/** Salidas de un día para «Dónde están»: horario, lugar, pasajeros y lo que les falta de equipo. */
export async function loadDaySessions(day: string, resources: readonly TeamResource[]): Promise<DaySession[]> {
  const rows = await loadSessions([day]);
  if (!rows.length) return [];
  const supabase = await createClient();
  const productIds = [...new Set(rows.map((row) => row.product_id))];
  const [{ data: availability, error }, { data: needs, error: needsError }] = await Promise.all([
    supabase
      .from("session_availability")
      .select("session_id, booked_seats")
      .in(
        "session_id",
        rows.map((row) => row.id),
      ),
    supabase.from("product_needs").select("product_id, resource_type, qty").in("product_id", productIds),
  ]);
  if (error || needsError) throw new Error("No se pudieron cargar las salidas.");

  const booked = new Map(availability.map((row) => [row.session_id, row.booked_seats ?? 0]));
  const byId = new Map(resources.map((resource) => [resource.id, resource]));
  return rows.map((row) => {
    const resourceIds = row.session_resources.map((item) => item.resource_id);
    const productNeeds = needsFromRows(needs.filter((need) => need.product_id === row.product_id));
    const product = { name: row.products.name, place: row.products.place, meetingPoint: row.products.meeting_point };
    return {
      id: row.id,
      productName: row.products.name,
      color: row.products.color,
      place: sessionPlace(product),
      meetingPoint: row.products.meeting_point,
      language: row.language,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      start: toBusinessDateTime(row.starts_at).time,
      end: toBusinessDateTime(row.ends_at).time,
      booked: booked.get(row.id) ?? 0,
      missing: missingResources(
        productNeeds,
        resourceIds.flatMap((id) => byId.get(id) ?? []),
      ),
      resourceIds,
    };
  });
}

/** Salidas de la semana con su equipo: planificación de guías y «N salidas esta semana». */
export async function loadWeekSessions(days: string[]): Promise<PlanSession[]> {
  const rows = await loadSessions(days);
  return rows.map((row) => {
    const { date, time } = toBusinessDateTime(row.starts_at);
    return {
      id: row.id,
      date,
      start: time,
      language: row.language,
      productName: row.products.name,
      color: row.products.color,
      resourceIds: row.session_resources.map((item) => item.resource_id),
    };
  });
}
