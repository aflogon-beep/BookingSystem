import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { localToInstant } from "@/lib/domain/schedule";

import { adminDb, anonDb, createTestUser, deleteTestUsers, type TestUser } from "./helpers";

// Ids fijos del seed (supabase/seed.sql).
const ADULT_ID = "00000000-0000-4000-8000-000000000101";

let member: TestUser;
let outsider: TestUser;
const createdProductIds: string[] = [];

beforeAll(async () => {
  member = await createTestUser({ name: "Beto Staff", role: "staff" });
  outsider = await createTestUser();
});

// Día que solo usa el test del job diario: genera para todos los productos y luego se limpia.
const JOB_DAY = "2030-11-13";

afterAll(async () => {
  await adminDb.from("sessions").delete().gte("starts_at", `${JOB_DAY}T00:00:00Z`).lt("starts_at", "2030-11-14T01:00:00Z");
  if (createdProductIds.length) await adminDb.from("products").delete().in("id", createdProductIds);
  await deleteTestUsers([outsider, member]);
});

type Rule = { weekdays: number[]; times: string[]; language: string; valid_from: string | null; valid_to: string | null };

const everyDay = (times: string[], language = "es"): Rule => ({
  weekdays: [1, 2, 3, 4, 5, 6, 7],
  times,
  language,
  valid_from: null,
  valid_to: null,
});

async function saveProduct(
  rules: Rule[],
  options: { id?: string; durationMin?: number; capacity?: number } = {},
): Promise<string> {
  const { data, error } = await member.db.rpc("save_product", {
    ...(options.id ? { p_id: options.id } : {}),
    p_product: {
      slug: `salidas-${randomUUID()}`,
      name: "Tour de salidas",
      description: "",
      meeting_point: "",
      place: "",
      duration_min: options.durationMin ?? 90,
      capacity: options.capacity ?? 10,
      min_pax: 1,
      pickup: false,
      color: "#0A84FF",
      photo_path: null,
      active: true,
    },
    p_prices: [{ ticket_type_id: ADULT_ID, price_cents: 1000 }],
    p_rules: rules,
  });
  if (error) throw error;
  const { id } = data as { id: string };
  if (!options.id) createdProductIds.push(id);
  return id;
}

// Fechas de 2030 para que el test no caduque: 2030-10-27 es el último domingo de octubre.
const generate = (productId: string, from = "2030-10-25", to = "2030-10-28", db = member.db) =>
  db.rpc("generate_sessions", { p_from: from, p_to: to, p_product_id: productId });

async function sessionsOf(productId: string) {
  const { data, error } = await adminDb
    .from("sessions")
    .select("starts_at, ends_at, language, capacity, status")
    .eq("product_id", productId)
    .order("starts_at");
  if (error) throw error;
  return data.map((session) => ({
    ...session,
    starts_at: new Date(session.starts_at).toISOString(),
    ends_at: new Date(session.ends_at).toISOString(),
  }));
}

describe("generate_sessions", () => {
  it("crea las salidas con la hora de Canarias, también en el cambio de hora", async () => {
    const id = await saveProduct([everyDay(["10:00"])]);
    const { data, error } = await generate(id);
    expect(error).toBeNull();
    expect(data).toBe(4);

    const sessions = await sessionsOf(id);
    expect(sessions.map((session) => session.starts_at)).toEqual([
      "2030-10-25T09:00:00.000Z",
      "2030-10-26T09:00:00.000Z",
      "2030-10-27T10:00:00.000Z",
      "2030-10-28T10:00:00.000Z",
    ]);
    // La misma conversión que la lógica de dominio (localToInstant).
    expect(sessions[2]?.starts_at).toBe(localToInstant("2030-10-27", "10:00").toISOString());
    expect(sessions[0]).toMatchObject({ ends_at: "2030-10-25T10:30:00.000Z", language: "es", capacity: 10, status: "open" });
  });

  it("es idempotente", async () => {
    const id = await saveProduct([everyDay(["10:00", "17:30"])]);
    await generate(id);
    const { data } = await generate(id);
    expect(data).toBe(0);
    expect(await sessionsOf(id)).toHaveLength(8);
  });

  it("respeta días, temporadas y, si dos reglas coinciden, gana la primera", async () => {
    const id = await saveProduct([
      { weekdays: [6, 7], times: ["10:00"], language: "en", valid_from: null, valid_to: null },
      { weekdays: [5, 6], times: ["10:00", "18:00"], language: "de", valid_from: "2030-10-26", valid_to: null },
    ]);
    await generate(id);
    expect((await sessionsOf(id)).map((session) => [session.starts_at, session.language])).toEqual([
      ["2030-10-26T09:00:00.000Z", "en"],
      ["2030-10-26T17:00:00.000Z", "de"],
      ["2030-10-27T10:00:00.000Z", "en"],
    ]);
  });

  it("al cambiar las reglas quita las salidas abiertas que sobran y conserva las cerradas", async () => {
    const id = await saveProduct([everyDay(["10:00", "18:00"])]);
    await generate(id);
    await adminDb.from("sessions").update({ status: "closed" }).eq("product_id", id).eq("starts_at", "2030-10-25T17:00:00Z");
    await adminDb
      .from("sessions")
      .update({ capacity: 4, capacity_custom: true })
      .eq("product_id", id)
      .eq("starts_at", "2030-10-25T09:00:00Z");

    await saveProduct([everyDay(["10:00"], "en")], { id, durationMin: 120, capacity: 8 });
    await generate(id);

    const sessions = await sessionsOf(id);
    expect(sessions.map((session) => [session.starts_at, session.status])).toEqual([
      ["2030-10-25T09:00:00.000Z", "open"],
      ["2030-10-25T17:00:00.000Z", "closed"],
      ["2030-10-26T09:00:00.000Z", "open"],
      ["2030-10-27T10:00:00.000Z", "open"],
      ["2030-10-28T10:00:00.000Z", "open"],
    ]);
    // Las abiertas siguen la regla y el producto nuevos (idioma, duración y aforo), salvo el aforo
    // cambiado a mano.
    expect(sessions[0]).toMatchObject({ language: "en", ends_at: "2030-10-25T11:00:00.000Z", capacity: 4 });
    expect(sessions[2]).toMatchObject({ language: "en", ends_at: "2030-10-26T11:00:00.000Z", capacity: 8 });
  });

  it("un producto desactivado no tiene salidas abiertas", async () => {
    const id = await saveProduct([everyDay(["10:00"])]);
    await generate(id);
    await member.db.from("products").update({ active: false }).eq("id", id);
    await generate(id);
    expect(await sessionsOf(id)).toEqual([]);
  });

  it("no crea salidas en el pasado", async () => {
    const id = await saveProduct([everyDay(["10:00"])]);
    const { data } = await generate(id, "2020-01-01", "2020-01-31");
    expect(data).toBe(0);
  });

  it("rechaza rangos no válidos", async () => {
    const id = await saveProduct([everyDay(["10:00"])]);
    expect((await generate(id, "2030-10-28", "2030-10-25")).error?.code).toBe("22023");
    expect((await generate(id, "2030-01-01", "2031-06-01")).error?.code).toBe("22023");
  });

  it("service role genera para todos los productos (job diario)", async () => {
    const id = await saveProduct([everyDay(["09:15"])]);
    const { error } = await adminDb.rpc("generate_sessions", { p_from: JOB_DAY, p_to: JOB_DAY });
    expect(error).toBeNull();
    expect((await sessionsOf(id)).map((session) => session.starts_at)).toEqual(["2030-11-13T09:15:00.000Z"]);
  });

  it("quien no es del equipo no genera nada y anon no puede llamarla", async () => {
    const id = await saveProduct([everyDay(["11:00"])]);
    const { data, error } = await generate(id, "2030-10-25", "2030-10-28", outsider.db);
    expect(error).toBeNull();
    expect(data).toBe(0);
    expect(await sessionsOf(id)).toEqual([]);

    const anon = await anonDb().rpc("generate_sessions", { p_from: "2030-10-25", p_to: "2030-10-28" });
    expect(anon.error).not.toBeNull();
  });
});

describe("RLS de sessions", () => {
  it("anon no puede leer y quien no es del equipo no ve nada", async () => {
    const anon = await anonDb().from("sessions").select("id");
    expect(anon.error?.code).toBe("42501");
    const outside = await outsider.db.from("sessions").select("id");
    expect(outside.error).toBeNull();
    expect(outside.data).toEqual([]);
  });

  it("el equipo ve y cambia el aforo de una salida", async () => {
    const id = await saveProduct([everyDay(["12:00"])]);
    await generate(id, "2030-10-25", "2030-10-25");
    const { data, error } = await member.db.from("sessions").update({ capacity: 6 }).eq("product_id", id).select("capacity");
    expect(error).toBeNull();
    expect(data).toEqual([{ capacity: 6 }]);
  });

  it("el equipo no puede mover una salida a otra hora ni a otro producto", async () => {
    const id = await saveProduct([everyDay(["12:30"])]);
    await generate(id, "2030-10-25", "2030-10-25");
    const moved = await member.db.from("sessions").update({ starts_at: "2030-10-25T15:00:00Z" }).eq("product_id", id);
    expect(moved.error?.code).toBe("42501");
    const other = await member.db.from("sessions").update({ product_id: randomUUID() }).eq("product_id", id);
    expect(other.error?.code).toBe("42501");
  });

  it("no admite estados ni aforos fuera de rango", async () => {
    const id = await saveProduct([everyDay(["13:00"])]);
    await generate(id, "2030-10-25", "2030-10-25");
    expect((await member.db.from("sessions").update({ status: "borrada" }).eq("product_id", id)).error?.code).toBe("23514");
    expect((await member.db.from("sessions").update({ capacity: 0 }).eq("product_id", id)).error?.code).toBe("23514");
  });
});
