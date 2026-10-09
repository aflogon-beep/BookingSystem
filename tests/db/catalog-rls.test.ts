import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adminDb, anonDb, createTestUser, deleteTestUsers, type TestUser } from "./helpers";

// Ids fijos del seed (supabase/seed.sql).
const TEIDE_ID = "00000000-0000-4000-8000-000000000201";
const ADULT_ID = "00000000-0000-4000-8000-000000000101";

const CATALOG_TABLES = ["settings", "ticket_types", "products", "product_prices", "schedule_rules"] as const;

let admin: TestUser;
let member: TestUser;
let outsider: TestUser;
const createdProductIds: string[] = [];
const createdTicketTypeIds: string[] = [];

beforeAll(async () => {
  admin = await createTestUser({ name: "Ana Admin", role: "admin" });
  member = await createTestUser({ name: "Beto Staff", role: "staff" });
  outsider = await createTestUser();
});

afterAll(async () => {
  if (createdProductIds.length) await adminDb.from("products").delete().in("id", createdProductIds);
  if (createdTicketTypeIds.length) await adminDb.from("ticket_types").delete().in("id", createdTicketTypeIds);
  await deleteTestUsers([outsider, member, admin]);
});

function newProduct() {
  return { slug: `prueba-${randomUUID()}`, name: "Tour de prueba", duration_min: 90, capacity: 10 };
}

describe("RLS del catálogo", () => {
  it.each(CATALOG_TABLES)("anon no puede leer %s", async (table) => {
    const { data, error } = await anonDb().from(table).select("*");
    expect(data ?? []).toEqual([]);
    expect(error?.code).toBe("42501");
  });

  it.each(CATALOG_TABLES)("un usuario sin fila en staff no ve %s", async (table) => {
    const { data, error } = await outsider.db.from(table).select("*");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("el equipo ve el catálogo del seed", async () => {
    const settings = await member.db.from("settings").select("business_name, currency, timezone").single();
    expect(settings.data).toEqual({ business_name: "Volcán Tours", currency: "EUR", timezone: "Atlantic/Canary" });

    const teide = await member.db
      .from("products")
      .select("slug, product_prices(price_cents, ticket_types(name)), schedule_rules(weekdays, times, language)")
      .eq("id", TEIDE_ID)
      .single();
    expect(teide.error).toBeNull();
    expect(teide.data?.slug).toBe("teide-atardecer-estrellas");
    expect(teide.data?.product_prices).toContainEqual({ price_cents: 6900, ticket_types: { name: "Adulto" } });
    expect(teide.data?.schedule_rules).toContainEqual({ weekdays: [1, 2, 3, 4, 5, 6, 7], times: ["16:30:00"], language: "es" });
  });

  it("el staff gestiona productos, precios y horarios", async () => {
    const product = await member.db.from("products").insert(newProduct()).select("id").single();
    expect(product.error).toBeNull();
    const productId = product.data!.id;
    createdProductIds.push(productId);

    const price = await member.db
      .from("product_prices")
      .insert({ product_id: productId, ticket_type_id: ADULT_ID, price_cents: 2500 })
      .select("price_cents");
    expect(price.error).toBeNull();
    expect(price.data).toEqual([{ price_cents: 2500 }]);

    const rule = await member.db
      .from("schedule_rules")
      .insert({ product_id: productId, weekdays: [6, 7], times: ["10:00"], language: "es" })
      .select("id");
    expect(rule.error).toBeNull();

    const update = await member.db.from("products").update({ active: false }).eq("id", productId).select("active");
    expect(update.data).toEqual([{ active: false }]);

    const remove = await member.db.from("products").delete().eq("id", productId).select("id");
    expect(remove.data).toHaveLength(1);
    // Al borrar el producto se borran sus precios y reglas.
    const orphans = await adminDb.from("schedule_rules").select("id").eq("product_id", productId);
    expect(orphans.data).toEqual([]);
  });

  it("el staff no cambia ajustes ni tipos de entrada", async () => {
    const settings = await member.db.from("settings").update({ business_name: "Otra" }).eq("id", 1).select();
    expect(settings.data).toEqual([]);

    const insert = await member.db.from("ticket_types").insert({ name: "Senior" });
    expect(insert.error?.code).toBe("42501");

    const update = await member.db.from("ticket_types").update({ name: "Mayor" }).eq("id", ADULT_ID).select();
    expect(update.data).toEqual([]);
  });

  it("un usuario sin fila en staff no puede escribir", async () => {
    const insert = await outsider.db.from("products").insert(newProduct());
    expect(insert.error?.code).toBe("42501");
    const update = await outsider.db.from("product_prices").update({ price_cents: 1 }).eq("product_id", TEIDE_ID).select();
    expect(update.data).toEqual([]);
  });

  it("el admin cambia ajustes y tipos de entrada", async () => {
    const before = await admin.db.from("settings").select("cutoff_hours").single();
    const update = await admin.db.from("settings").update({ cutoff_hours: 3 }).eq("id", 1).select("cutoff_hours");
    expect(update.data).toEqual([{ cutoff_hours: 3 }]);
    await adminDb.from("settings").update({ cutoff_hours: before.data!.cutoff_hours }).eq("id", 1);

    const ticketType = await admin.db.from("ticket_types").insert({ name: "Senior", note: "65 o más" }).select("id").single();
    expect(ticketType.error).toBeNull();
    createdTicketTypeIds.push(ticketType.data!.id);
  });

  it("los ajustes son una fila única que no se crea ni se borra", async () => {
    const insert = await admin.db.from("settings").insert({ id: 2 });
    expect(insert.error?.code).toBe("42501");
    const remove = await admin.db.from("settings").delete().eq("id", 1);
    expect(remove.error?.code).toBe("42501");
  });
});

describe("Restricciones del catálogo", () => {
  it("rechaza precios negativos", async () => {
    const { error } = await adminDb
      .from("product_prices")
      .update({ price_cents: -1 })
      .eq("product_id", TEIDE_ID)
      .eq("ticket_type_id", ADULT_ID);
    expect(error?.code).toBe("23514");
  });

  it("rechaza días de la semana fuera de 1..7 y reglas sin horas", async () => {
    const badDay = await adminDb
      .from("schedule_rules")
      .insert({ product_id: TEIDE_ID, weekdays: [0], times: ["10:00"], language: "es" });
    expect(badDay.error?.code).toBe("23514");
    const noTimes = await adminDb
      .from("schedule_rules")
      .insert({ product_id: TEIDE_ID, weekdays: [1], times: [], language: "es" });
    expect(noTimes.error?.code).toBe("23514");
  });

  it("rechaza un mínimo mayor que el aforo", async () => {
    const { error } = await adminDb.from("products").insert({ ...newProduct(), capacity: 2, min_pax: 3 });
    expect(error?.code).toBe("23514");
  });

  it("no deja borrar un tipo de entrada que algún producto vende", async () => {
    const { error } = await adminDb.from("ticket_types").delete().eq("id", ADULT_ID);
    expect(error?.code).toBe("23503");
  });
});
