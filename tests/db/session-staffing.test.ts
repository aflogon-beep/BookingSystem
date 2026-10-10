import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adminDb, anonDb, createTestUser, deleteTestUsers, type TestUser } from "./helpers";

// Ids fijos del seed (supabase/seed.sql).
const ADULT_ID = "00000000-0000-4000-8000-000000000101";

// Fecha lejana que no usa ningún otro test.
const DAY = "2031-08-13";

let member: TestUser;
let outsider: TestUser;
let productId: string;
let sessionId: string;
let plainProductId: string;
let plainSessionId: string;
const resourceIds: string[] = [];

beforeAll(async () => {
  member = await createTestUser({ name: "Nora Staff", role: "staff" });
  outsider = await createTestUser();
  productId = await createProduct({ guide: 1, vehicle: 1, equipment: 0 });
  sessionId = await sessionOf(productId);
  plainProductId = await createProduct({ guide: 0, vehicle: 0, equipment: 0 });
  plainSessionId = await sessionOf(plainProductId);
});

async function createProduct(needs: { guide: number; vehicle: number; equipment: number }): Promise<string> {
  const { data, error } = await member.db.rpc("save_product", {
    p_product: {
      slug: `avisos-${randomUUID()}`,
      name: "Tour de avisos (test)",
      description: "",
      meeting_point: "",
      place: "",
      duration_min: 60,
      capacity: 10,
      min_pax: 1,
      pickup: false,
      color: "#0A84FF",
      photo_path: null,
      active: true,
      needs,
    },
    p_prices: [{ ticket_type_id: ADULT_ID, price_cents: 2500 }],
    p_rules: [{ weekdays: [1, 2, 3, 4, 5, 6, 7], times: ["10:00"], language: "es", valid_from: null, valid_to: null }],
  });
  if (error) throw error;
  return (data as { id: string }).id;
}

async function sessionOf(id: string): Promise<string> {
  expect((await member.db.rpc("generate_sessions", { p_from: DAY, p_to: DAY, p_product_id: id })).error).toBeNull();
  const { data: session, error } = await adminDb.from("sessions").select("id").eq("product_id", id).single();
  if (error) throw error;
  return session.id;
}

afterAll(async () => {
  await adminDb.from("products").delete().in("id", [productId, plainProductId]);
  if (resourceIds.length) await adminDb.from("resources").delete().in("id", resourceIds);
  await deleteTestUsers([outsider, member]);
});

describe("session_staffing", () => {
  it("cuenta lo que le falta a la salida por tipo y deja de avisar al asignarlo", async () => {
    const before = await member.db.from("session_staffing").select("missing_guides, missing_vehicles, missing_equipment, missing").eq("session_id", sessionId).single();
    expect(before.data).toEqual({ missing_guides: 1, missing_vehicles: 1, missing_equipment: 0, missing: 2 });

    const { data: guide, error } = await member.db
      .from("resources")
      .insert({ name: `Guía avisos ${randomUUID().slice(0, 6)}`, type: "guide", languages: ["es"] })
      .select("id")
      .single();
    if (error) throw error;
    resourceIds.push(guide.id);
    expect((await member.db.from("session_resources").insert({ session_id: sessionId, resource_id: guide.id })).error).toBeNull();

    const after = await member.db.from("session_staffing").select("missing_guides, missing_vehicles, missing").eq("session_id", sessionId).single();
    expect(after.data).toEqual({ missing_guides: 0, missing_vehicles: 1, missing: 1 });
  });

  it("con más equipo del necesario no da negativo y coincide con session_missing_resources", async () => {
    const { data: guide, error } = await member.db
      .from("resources")
      .insert({ name: `Guía avisos ${randomUUID().slice(0, 6)}`, type: "guide", languages: ["es"] })
      .select("id")
      .single();
    if (error) throw error;
    resourceIds.push(guide.id);
    expect((await member.db.from("session_resources").insert({ session_id: sessionId, resource_id: guide.id })).error).toBeNull();

    const row = await member.db.from("session_staffing").select("missing_guides, missing_vehicles, missing").eq("session_id", sessionId).single();
    expect(row.data).toEqual({ missing_guides: 0, missing_vehicles: 1, missing: 1 });
    const fn = await member.db.rpc("session_missing_resources", { p_session_id: sessionId });
    expect(fn.data).toBe(1);
  });

  it("una salida de un producto sin necesidades no avisa (0, no null)", async () => {
    const row = await member.db.from("session_staffing").select("missing_guides, missing_vehicles, missing_equipment, missing").eq("session_id", plainSessionId).single();
    expect(row.data).toEqual({ missing_guides: 0, missing_vehicles: 0, missing_equipment: 0, missing: 0 });
    const fn = await member.db.rpc("session_missing_resources", { p_session_id: plainSessionId });
    expect(fn.data).toBe(0);
  });

  it("quien no es del equipo no ve nada", async () => {
    const anon = await anonDb().from("session_staffing").select("session_id").eq("session_id", sessionId);
    expect(anon.error).not.toBeNull();
    const outside = await outsider.db.from("session_staffing").select("session_id").eq("session_id", sessionId);
    expect(outside.error).toBeNull();
    expect(outside.data).toEqual([]);
  });
});
