import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adminDb, createTestUser, deleteTestUsers, type TestUser } from "./helpers";

// Ids fijos del seed (supabase/seed.sql).
const ADULT_ID = "00000000-0000-4000-8000-000000000101";
const ANA = "00000000-0000-4000-8000-000000000301";
const LUKAS = "00000000-0000-4000-8000-000000000302";
const CARMEN = "00000000-0000-4000-8000-000000000303";
const MINIBUS_01 = "00000000-0000-4000-8000-000000000311";
const MINIBUS_02 = "00000000-0000-4000-8000-000000000312";
const VAN_08 = "00000000-0000-4000-8000-000000000313";

// Fecha lejana que no usa ningún otro test: así los recursos del seed están libres.
const DAY = "2031-05-21";
const PRODUCT_NAME = "Tour de asignación (test)";

let member: TestUser;
let outsider: TestUser;
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
  member = await createTestUser({ name: "Rita Staff", role: "staff" });
  outsider = await createTestUser();
});

afterAll(async () => {
  await removeTestProducts(productIds);
  await adminDb.from("customers").delete().like("email", `%-${testTag}@example.test`);
  await deleteTestUsers([outsider, member]);
});

/** Producto que necesita un guía y un vehículo, con salidas el día DAY a esas horas (3 h), en orden. */
async function createSessions(language: string, capacity: number, times: string[]): Promise<string[]> {
  const { data, error } = await member.db.rpc("save_product", {
    p_product: {
      slug: `asignacion-${randomUUID()}`,
      name: PRODUCT_NAME,
      description: "",
      meeting_point: "",
      place: "",
      duration_min: 180,
      capacity,
      min_pax: 1,
      pickup: false,
      color: "#0A84FF",
      photo_path: null,
      active: true,
      needs: { guide: 1, vehicle: 1, equipment: 0 },
    },
    p_prices: [{ ticket_type_id: ADULT_ID, price_cents: 5000 }],
    p_rules: [{ weekdays: [1, 2, 3, 4, 5, 6, 7], times, language, valid_from: null, valid_to: null }],
  });
  if (error) throw error;
  const { id: productId } = data as { id: string };
  productIds.push(productId);
  const generated = await member.db.rpc("generate_sessions", { p_from: DAY, p_to: DAY, p_product_id: productId });
  if (generated.error) throw generated.error;
  const { data: sessions, error: sessionError } = await adminDb
    .from("sessions")
    .select("id")
    .eq("product_id", productId)
    .order("starts_at");
  if (sessionError) throw sessionError;
  return sessions.map((session) => session.id);
}

async function book(sessionId: string, channel = "phone"): Promise<string> {
  const { data, error } = await member.db.rpc("create_booking_hold", {
    p_session_id: sessionId,
    p_lines: [{ ticket_type_id: ADULT_ID, qty: 2 }],
    p_customer: { name: "Lucía Pérez", email: `${randomUUID().slice(0, 8)}-${testTag}@example.test` },
    p_booking: { channel },
  });
  if (error) throw error;
  return (data as { id: string }).id;
}

const assignedTo = async (sessionId: string) => {
  const { data } = await adminDb.from("session_resources").select("resource_id").eq("session_id", sessionId);
  return (data ?? []).map((row) => row.resource_id).sort();
};

describe("asignación automática", () => {
  it("la primera reserva confirmada asigna un guía del idioma y el vehículo más pequeño que cabe", async () => {
    const [first, second] = await createSessions("de", 10, ["09:00", "10:00"]);
    if (!first || !second) throw new Error("Sin salidas");

    await book(first);
    // Lukas es el único guía en alemán; la furgoneta de 8 no llega a 10 plazas.
    expect(await assignedTo(first)).toEqual([LUKAS, MINIBUS_01].sort());

    // A la vez, Lukas ya está ocupado: falta el guía, pero el otro minibús sí se asigna.
    await book(second);
    expect(await assignedTo(second)).toEqual([MINIBUS_02]);
    const { data: missing } = await member.db.rpc("session_missing_resources", { p_session_id: second });
    expect(missing).toBe(1);
  });

  it("solo asigna si la salida no tiene nada: lo cambiado a mano se respeta", async () => {
    const [session] = await createSessions("es", 6, ["14:00"]);
    if (!session) throw new Error("Sin salida");
    expect((await member.db.rpc("session_set_resources", { p_session_id: session, p_resource_ids: [ANA] })).error).toBeNull();
    await book(session);
    expect(await assignedTo(session)).toEqual([ANA]);

    // «Auto» vuelve a elegir todo: un guía en español y la furgoneta de 8 para 6 plazas.
    const { data, error } = await member.db.rpc("session_auto_assign", { p_session_id: session });
    expect(error).toBeNull();
    expect(data).toBe(0);
    const assigned = await assignedTo(session);
    expect(assigned).toContain(VAN_08);
    expect(assigned).toHaveLength(2);
  });

  it("si ningún vehículo llega al aforo, asigna el más grande libre", async () => {
    const [session] = await createSessions("es", 20, ["03:00"]);
    if (!session) throw new Error("Sin salida");
    await book(session);
    expect(await assignedTo(session)).toContain(MINIBUS_01);
  });

  it("una reserva web pendiente no asigna; al confirmarse, sí", async () => {
    const [session] = await createSessions("es", 6, ["22:00"]);
    if (!session) throw new Error("Sin salida");
    const { data, error } = await adminDb.rpc("create_booking_hold", {
      p_session_id: session,
      p_lines: [{ ticket_type_id: ADULT_ID, qty: 2 }],
      p_customer: { name: "Lucía Pérez", email: `web-${randomUUID().slice(0, 8)}-${testTag}@example.test` },
      p_booking: { channel: "web" },
    });
    expect(error).toBeNull();
    expect(await assignedTo(session)).toEqual([]);
    const { id } = data as { id: string };
    expect((await adminDb.from("bookings").update({ status: "confirmed" }).eq("id", id)).error).toBeNull();
    expect(await assignedTo(session)).toHaveLength(2);
  });

  it("mover una reserva a una salida sin equipo se lo asigna", async () => {
    const [from, to] = await createSessions("de", 6, ["02:00", "19:00"]);
    if (!from || !to) throw new Error("Sin salidas");
    const id = await book(from);
    expect((await member.db.rpc("booking_move", { p_booking_id: id, p_session_id: to })).error).toBeNull();
    expect(await assignedTo(to)).toEqual([LUKAS, VAN_08].sort());
  });

  it("«Auto» no actúa sobre una salida cancelada", async () => {
    const [session] = await createSessions("es", 6, ["23:00"]);
    if (!session) throw new Error("Sin salida");
    expect((await member.db.rpc("session_set_status", { p_session_id: session, p_status: "cancelled" })).error).toBeNull();
    const { error } = await member.db.rpc("session_auto_assign", { p_session_id: session });
    expect(error?.code).toBe("23514");
  });

  it("quien no es del equipo no puede pedir la asignación automática", async () => {
    const [session] = await createSessions("es", 6, ["19:00"]);
    if (!session) throw new Error("Sin salida");
    const { error } = await outsider.db.rpc("session_auto_assign", { p_session_id: session });
    expect(error?.code).toBe("42501");
    const internal = await member.db.rpc("assign_session_resources", { p_session_id: session, p_replace: true });
    expect(internal.error).not.toBeNull();
  });
});

describe("asignación manual", () => {
  it("sustituye todo el equipo y falla si un recurso está en otra salida a esa hora", async () => {
    const [first, second] = await createSessions("en", 6, ["08:00", "09:30"]);
    if (!first || !second) throw new Error("Sin salidas");
    const set = (sessionId: string, ids: string[]) =>
      member.db.rpc("session_set_resources", { p_session_id: sessionId, p_resource_ids: ids });

    expect((await set(first, [ANA, VAN_08, ANA])).error).toBeNull();
    expect(await assignedTo(first)).toEqual([ANA, VAN_08].sort());

    // Guarda el orden elegido, para que «Guía 1» y «Guía 2» no se intercambien al recargar.
    expect((await set(first, [VAN_08, CARMEN, ANA])).error).toBeNull();
    const { data: ordered } = await member.db
      .from("session_resources")
      .select("resource_id")
      .eq("session_id", first)
      .order("created_at");
    expect(ordered?.map((row) => row.resource_id)).toEqual([VAN_08, CARMEN, ANA]);
    expect((await set(first, [ANA, VAN_08])).error).toBeNull();
    expect((await set(second, [ANA])).error?.code).toBe("23P01");
    expect(await assignedTo(second)).toEqual([]);

    expect((await set(first, [])).error).toBeNull();
    expect(await assignedTo(first)).toEqual([]);
    expect((await outsider.db.rpc("session_set_resources", { p_session_id: first, p_resource_ids: [ANA] })).error).not.toBeNull();
    expect(await assignedTo(first)).toEqual([]);
  });
});
