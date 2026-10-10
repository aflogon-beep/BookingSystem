import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adminDb, createTestUser, deleteTestUsers, type TestUser } from "./helpers";

// Ids fijos del seed (supabase/seed.sql). Lukas es el único guía del seed que guía en alemán: las
// salidas en alemán de estos tests tienen un solo guía posible, como una empresa con un guía.
const ADULT_ID = "00000000-0000-4000-8000-000000000101";
const LUKAS = "00000000-0000-4000-8000-000000000302";

// Fechas lejanas que no usa ningún otro test (una por caso): así Lukas está libre.
const DAYS = ["2031-07-14", "2031-07-15", "2031-07-16", "2031-07-17", "2031-07-18", "2031-07-19"] as const;
const PRODUCT_NAME = "Tour de recursos obligatorios (test)";

let member: TestUser;
const productIds: string[] = [];
const testTag = randomUUID().slice(0, 8);

async function removeTestProducts(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { data: sessions } = await adminDb.from("sessions").select("id").in("product_id", ids);
  const sessionIds = sessions?.map((session) => session.id) ?? [];
  if (sessionIds.length) await adminDb.from("bookings").delete().in("session_id", sessionIds);
  await adminDb.from("products").delete().in("id", ids);
}

beforeAll(async () => {
  const { data: leftovers } = await adminDb.from("products").select("id").eq("name", PRODUCT_NAME);
  await removeTestProducts(leftovers?.map((product) => product.id) ?? []);
  member = await createTestUser({ name: "Eva Staff", role: "staff" });
});

afterAll(async () => {
  await removeTestProducts(productIds);
  await adminDb.from("customers").delete().like("email", `%-${testTag}@example.test`);
  await deleteTestUsers([member]);
});

/**
 * Producto que necesita un guía (obligatorio salvo que se diga), con salidas en alemán de 3 h ese
 * día a esas horas (en orden).
 */
async function createSessions(day: string, times: string[], guideRequired = true): Promise<string[]> {
  const { data, error } = await member.db.rpc("save_product", {
    p_product: {
      slug: `equipo-${randomUUID()}`,
      name: PRODUCT_NAME,
      description: "",
      meeting_point: "",
      place: "",
      duration_min: 180,
      capacity: 10,
      min_pax: 1,
      pickup: false,
      color: "#0A84FF",
      photo_path: null,
      active: true,
      needs: { guide: 1, vehicle: 0, equipment: 0 },
      needs_required: { guide: guideRequired, vehicle: true, equipment: true },
    },
    p_prices: [{ ticket_type_id: ADULT_ID, price_cents: 5000 }],
    p_rules: [{ weekdays: [1, 2, 3, 4, 5, 6, 7], times, language: "de", valid_from: null, valid_to: null }],
  });
  if (error) throw error;
  const { id: productId } = data as { id: string };
  productIds.push(productId);
  const generated = await member.db.rpc("generate_sessions", { p_from: day, p_to: day, p_product_id: productId });
  if (generated.error) throw generated.error;
  const { data: sessions, error: sessionError } = await adminDb
    .from("sessions")
    .select("id")
    .eq("product_id", productId)
    .order("starts_at");
  if (sessionError) throw sessionError;
  return sessions.map((session) => session.id);
}

/** Un producto con una sola salida. */
async function createSession(day: string, time: string, guideRequired = true): Promise<string> {
  const [id] = await createSessions(day, [time], guideRequired);
  if (!id) throw new Error("Sin salida");
  return id;
}

function book(sessionId: string, channel: "web" | "phone") {
  return (channel === "web" ? adminDb : member.db).rpc("create_booking_hold", {
    p_session_id: sessionId,
    p_lines: [{ ticket_type_id: ADULT_ID, qty: 2 }],
    p_customer: { name: "Lucía Pérez", email: `${randomUUID().slice(0, 8)}-${testTag}@example.test` },
    p_booking: channel === "web" ? { channel, payment: "on_site" } : { channel },
  });
}

async function bookOk(sessionId: string, channel: "web" | "phone"): Promise<string> {
  const { data, error } = await book(sessionId, channel);
  if (error) throw error;
  return (data as { id: string }).id;
}

async function teamStatus(sessionId: string) {
  const { data, error } = await adminDb
    .from("session_team_status")
    .select("team_free, blocking_need")
    .eq("session_id", sessionId)
    .single();
  if (error) throw error;
  return data;
}

const teamFree = async (sessionId: string) => (await teamStatus(sessionId)).team_free;

const assignedTo = async (sessionId: string) => {
  const { data } = await adminDb.from("session_resources").select("resource_id").eq("session_id", sessionId);
  return (data ?? []).map((row) => row.resource_id);
};

describe("recursos obligatorios", () => {
  it("la primera reserva se queda con el guía y las salidas que se solapan dejan de admitir reservas", async () => {
    const hiking = await createSession(DAYS[0], "09:00");
    const volcanoes = await createSession(DAYS[0], "10:00");
    const afternoon = await createSession(DAYS[0], "12:00");
    expect(await teamFree(hiking)).toBe(true);
    expect(await teamFree(volcanoes)).toBe(true);

    await bookOk(hiking, "web");
    expect(await assignedTo(hiking)).toEqual([LUKAS]);
    // 09:00–12:00 ocupa a Lukas: la de las 10:00 no admite reservas; la de las 12:00, ya libre, sí.
    expect(await teamFree(hiking)).toBe(true);
    expect(await teamStatus(volcanoes)).toEqual({ team_free: false, blocking_need: "guide" });
    expect(await teamFree(afternoon)).toBe(true);
    for (const channel of ["web", "phone"] as const) {
      const blocked = await book(volcanoes, channel);
      expect(blocked.error?.code).toBe("RB012");
      expect(blocked.error?.hint).toBe("guide");
    }
    await bookOk(hiking, "phone");
    await bookOk(afternoon, "web");
    expect(await assignedTo(afternoon)).toEqual([LUKAS]);
  });

  it("un recurso no obligatorio no bloquea: la salida se vende y queda sin guía", async () => {
    const first = await createSession(DAYS[1], "09:00");
    const optional = await createSession(DAYS[1], "10:00", false);
    const { data: need } = await adminDb.from("product_needs").select("required").eq("product_id", productIds.at(-1) ?? "").single();
    expect(need?.required).toBe(false);

    await bookOk(first, "phone");
    expect(await teamFree(optional)).toBe(true);
    await bookOk(optional, "web");
    expect(await assignedTo(optional)).toEqual([]);
    const { data: missing } = await member.db.rpc("session_missing_resources", { p_session_id: optional });
    expect(missing).toBe(1);
  });

  it("al cancelar la última reserva, el guía se libera y la otra salida vuelve a admitir reservas", async () => {
    const first = await createSession(DAYS[2], "14:00");
    const second = await createSession(DAYS[2], "15:00");
    const a = await bookOk(first, "web");
    const b = await bookOk(first, "phone");
    expect(await teamFree(second)).toBe(false);

    expect((await member.db.rpc("booking_cancel", { p_booking_id: a })).error).toBeNull();
    expect(await assignedTo(first)).toEqual([LUKAS]);
    expect(await teamFree(second)).toBe(false);

    expect((await member.db.rpc("booking_cancel", { p_booking_id: b })).error).toBeNull();
    expect(await assignedTo(first)).toEqual([]);
    expect(await teamFree(second)).toBe(true);
    await bookOk(second, "web");
    expect(await assignedTo(second)).toEqual([LUKAS]);
  });

  it("al mover la única reserva a una salida que se solapa, el guía la acompaña", async () => {
    // booking_move solo cambia a salidas del mismo producto.
    const [from, to] = await createSessions(DAYS[3], ["18:00", "19:00"]);
    if (!from || !to) throw new Error("Sin salidas");
    const id = await bookOk(from, "phone");
    expect((await member.db.rpc("booking_move", { p_booking_id: id, p_session_id: to })).error).toBeNull();
    expect(await assignedTo(from)).toEqual([]);
    expect(await assignedTo(to)).toEqual([LUKAS]);
  });

  it("no mueve una reserva a una salida sin su guía obligatorio libre", async () => {
    const [from, to, other] = await createSessions(DAYS[4], ["08:00", "16:00", "17:00"]);
    if (!from || !to || !other) throw new Error("Sin salidas");
    const id = await bookOk(from, "phone");
    await bookOk(other, "phone");
    expect(await assignedTo(other)).toEqual([LUKAS]);

    const moved = await member.db.rpc("booking_move", { p_booking_id: id, p_session_id: to });
    expect(moved.error?.code).toBe("RB012");
    // Se deshace todo: la reserva sigue donde estaba, con su guía.
    const { data: booking } = await adminDb.from("bookings").select("session_id").eq("id", id).single();
    expect(booking?.session_id).toBe(from);
    expect(await assignedTo(from)).toEqual([LUKAS]);
  });

  it("si llegan a la vez reservas a dos salidas que se solapan, solo una se acepta", async () => {
    const first = await createSession(DAYS[5], "02:00");
    const second = await createSession(DAYS[5], "03:00");
    const results = await Promise.all([book(first, "web"), book(second, "phone")]);
    const codes = results.map((result) => result.error?.code ?? "ok").sort();
    expect(codes).toEqual(["RB012", "ok"]);
  });
});
