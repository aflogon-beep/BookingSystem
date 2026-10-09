import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { TablesInsert } from "@/lib/database.types";

import { adminDb, anonDb, createTestUser, deleteTestUsers, type TestUser } from "./helpers";

// Ids fijos del seed (supabase/seed.sql).
const ADULT_ID = "00000000-0000-4000-8000-000000000101";

let member: TestUser;
let outsider: TestUser;
let productId: string;
const createdResourceIds: string[] = [];

beforeAll(async () => {
  member = await createTestUser({ name: "Beto Staff", role: "staff" });
  outsider = await createTestUser();
  const { data, error } = await adminDb
    .from("products")
    .insert({ slug: `recursos-${randomUUID()}`, name: "Tour de recursos", duration_min: 120, capacity: 10, active: false })
    .select("id")
    .single();
  if (error) throw error;
  productId = data.id;
});

afterAll(async () => {
  if (createdResourceIds.length) await adminDb.from("resources").delete().in("id", createdResourceIds);
  // Borra también sus salidas (cascade).
  if (productId) await adminDb.from("products").delete().eq("id", productId);
  await deleteTestUsers([outsider, member]);
});

async function newResource(name = "Guía de prueba", type = "guide"): Promise<string> {
  const { data, error } = await member.db.from("resources").insert({ name, type, languages: type === "guide" ? ["es"] : [] }).select("id").single();
  if (error) throw error;
  createdResourceIds.push(data.id);
  return data.id;
}

// Salidas en 2030 de un producto inactivo: no las toca generate_sessions.
async function newSession(startsAt: string, minutes = 120): Promise<string> {
  const start = new Date(startsAt);
  const { data, error } = await adminDb
    .from("sessions")
    .insert({
      product_id: productId,
      starts_at: start.toISOString(),
      ends_at: new Date(start.getTime() + minutes * 60_000).toISOString(),
      language: "es",
      capacity: 10,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

const assign = (sessionId: string, resourceId: string) =>
  member.db.from("session_resources").insert({ session_id: sessionId, resource_id: resourceId });

const assignedTo = async (sessionId: string) => {
  const { data } = await adminDb.from("session_resources").select("resource_id").eq("session_id", sessionId);
  return (data ?? []).map((row) => row.resource_id);
};

describe("recursos", () => {
  it("el equipo da de alta, edita y borra fichas; quien no es del equipo no las ve", async () => {
    const id = await newResource("Ana de prueba");
    const { error } = await member.db.from("resources").update({ name: "Ana Pérez", languages: ["es", "en"] }).eq("id", id);
    expect(error).toBeNull();

    for (const db of [anonDb(), outsider.db]) {
      const { data } = await db.from("resources").select("id").eq("id", id);
      expect(data ?? []).toEqual([]);
      const insert = await db.from("resources").insert({ name: "Intruso", type: "guide" });
      expect(insert.error).not.toBeNull();
    }

    const removed = await member.db.from("resources").delete().eq("id", id).select("id");
    expect(removed.data).toHaveLength(1);
  });

  it("valida nombre, tipo, asientos e idiomas", async () => {
    const cases: TablesInsert<"resources">[] = [
      { name: " ", type: "guide" },
      { name: "Barco", type: "boat" },
      { name: "Minibús", type: "vehicle", seats: 0 },
      { name: "Guía", type: "guide", languages: ["ES"] },
      { name: "Guía", type: "guide", seats: 2 },
      { name: "Minibús", type: "vehicle", languages: ["es"] },
    ];
    for (const row of cases) {
      const { error } = await member.db.from("resources").insert(row);
      expect(error?.code).toBe("23514");
    }
  });
});

describe("asignación sin solapes", () => {
  it("un recurso no puede estar en dos salidas que se solapan, pero sí en una que empieza al acabar la otra", async () => {
    const guide = await newResource();
    const morning = await newSession("2030-11-04T09:00:00Z");
    const overlapping = await newSession("2030-11-04T10:00:00Z");
    const afterwards = await newSession("2030-11-04T11:00:00Z");

    expect((await assign(morning, guide)).error).toBeNull();
    expect((await assign(overlapping, guide)).error?.code).toBe("23P01");
    expect((await assign(afterwards, guide)).error).toBeNull();

    const { data } = await adminDb.from("session_resources").select("period").eq("session_id", morning).single();
    expect(String(data?.period)).toContain("2030-11-04 09:00:00+00");
  });

  it("si una salida cambia de hora, sus recursos la siguen, salvo los que ya están ocupados a la hora nueva", async () => {
    const guide = await newResource();
    const free = await newResource("Furgoneta de prueba", "vehicle");
    const first = await newSession("2030-11-05T09:00:00Z");
    const second = await newSession("2030-11-05T15:00:00Z");
    expect((await assign(first, guide)).error).toBeNull();
    expect((await assign(second, guide)).error).toBeNull();
    expect((await assign(second, free)).error).toBeNull();

    const { error } = await adminDb
      .from("sessions")
      .update({ starts_at: "2030-11-05T10:00:00Z", ends_at: "2030-11-05T12:00:00Z" })
      .eq("id", second);
    expect(error).toBeNull();
    expect(await assignedTo(second)).toEqual([free]);
    const { data } = await adminDb.from("session_resources").select("period").eq("session_id", second).single();
    expect(String(data?.period)).toContain("2030-11-05 10:00:00+00");
  });

  it("si varias salidas crecen a la vez y se solapan, el recurso se queda solo en una", async () => {
    const guide = await newResource();
    const rules = [{ weekdays: [1, 2, 3, 4, 5, 6, 7], times: ["09:00", "11:00"], language: "es", valid_from: null, valid_to: null }];
    const product = (durationMin: number) => ({
      slug: `recursos-crecen-${randomUUID()}`,
      name: "Tour que crece",
      description: "",
      meeting_point: "",
      place: "",
      duration_min: durationMin,
      capacity: 10,
      min_pax: 1,
      pickup: false,
      color: "#0A84FF",
      photo_path: null,
      active: true,
    });
    const prices = [{ ticket_type_id: ADULT_ID, price_cents: 1000 }];
    const { data, error } = await member.db.rpc("save_product", { p_product: product(120), p_prices: prices, p_rules: rules });
    expect(error).toBeNull();
    const { id } = data as { id: string };
    try {
      // 2030-11-11 no lo usa ningún otro test.
      const generate = () => member.db.rpc("generate_sessions", { p_from: "2030-11-11", p_to: "2030-11-11", p_product_id: id });
      expect((await generate()).error).toBeNull();
      const { data: sessions } = await adminDb.from("sessions").select("id").eq("product_id", id);
      expect(sessions).toHaveLength(2);
      for (const session of sessions ?? []) expect((await assign(session.id, guide)).error).toBeNull();

      // 3 horas: 09:00–12:00 y 11:00–14:00 se solapan. generate_sessions las cambia en un solo update.
      expect((await member.db.rpc("save_product", { p_id: id, p_product: product(180), p_prices: prices, p_rules: rules })).error).toBeNull();
      expect((await generate()).error).toBeNull();
      const { data: left } = await adminDb.from("session_resources").select("session_id").eq("resource_id", guide);
      expect(left).toHaveLength(1);
    } finally {
      await adminDb.from("products").delete().eq("id", id);
    }
  });

  it("cancelar una salida libera sus recursos y ya no admite asignaciones", async () => {
    const guide = await newResource();
    const session = await newSession("2030-11-06T09:00:00Z");
    expect((await assign(session, guide)).error).toBeNull();

    const { error } = await member.db.rpc("session_set_status", { p_session_id: session, p_status: "cancelled" });
    expect(error).toBeNull();
    expect(await assignedTo(session)).toEqual([]);
    expect((await assign(session, guide)).error?.code).toBe("23514");
  });

  it("borrar un recurso lo quita de sus salidas", async () => {
    const guide = await newResource();
    const session = await newSession("2030-11-07T09:00:00Z");
    expect((await assign(session, guide)).error).toBeNull();
    const { error } = await member.db.from("resources").delete().eq("id", guide);
    expect(error).toBeNull();
    expect(await assignedTo(session)).toEqual([]);
  });

  it("quien no es del equipo no ve ni asigna recursos", async () => {
    const guide = await newResource();
    const session = await newSession("2030-11-08T09:00:00Z");
    expect((await assign(session, guide)).error).toBeNull();
    for (const db of [anonDb(), outsider.db]) {
      const { data } = await db.from("session_resources").select("resource_id").eq("session_id", session);
      expect(data ?? []).toEqual([]);
      const other = await newSession(`2030-11-08T1${db === outsider.db ? 2 : 4}:00:00Z`);
      expect((await db.from("session_resources").insert({ session_id: other, resource_id: guide })).error).not.toBeNull();
    }
  });
});

describe("lo que necesita cada producto", () => {
  const product = (needs?: Record<string, number>) => ({
    slug: `necesidades-${randomUUID()}`,
    name: "Tour con equipo",
    description: "",
    meeting_point: "",
    place: "",
    duration_min: 90,
    capacity: 10,
    min_pax: 1,
    pickup: false,
    color: "#0A84FF",
    photo_path: null,
    active: false,
    ...(needs ? { needs } : {}),
  });

  it("save_product guarda las necesidades, sin filas para los 0, y no las toca si no llegan", async () => {
    const save = (id: string | null, needs?: Record<string, number>) =>
      member.db.rpc("save_product", {
        ...(id ? { p_id: id } : {}),
        p_product: product(needs),
        p_prices: [{ ticket_type_id: ADULT_ID, price_cents: 1000 }],
        p_rules: [],
      });
    const { data, error } = await save(null, { guide: 2, vehicle: 0, equipment: 1 });
    expect(error).toBeNull();
    const { id } = data as { id: string };
    try {
      const read = async () =>
        (await member.db.from("product_needs").select("resource_type, qty").eq("product_id", id).order("resource_type")).data;
      expect(await read()).toEqual([
        { resource_type: "equipment", qty: 1 },
        { resource_type: "guide", qty: 2 },
      ]);

      expect((await save(id)).error).toBeNull();
      expect(await read()).toHaveLength(2);

      expect((await save(id, { guide: 6, vehicle: 0, equipment: 0 })).error?.code).toBe("23514");
      expect((await save(id, { guide: 1, vehicle: 1, equipment: 0 })).error).toBeNull();
      expect(await read()).toEqual([
        { resource_type: "guide", qty: 1 },
        { resource_type: "vehicle", qty: 1 },
      ]);
    } finally {
      await adminDb.from("products").delete().eq("id", id);
    }
  });

  it("quien no es del equipo no ve las necesidades", async () => {
    const { data } = await outsider.db.from("product_needs").select("product_id");
    expect(data ?? []).toEqual([]);
  });
});
