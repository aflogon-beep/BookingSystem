import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adminDb, anonDb, createTestUser, deleteTestUsers, type TestUser } from "./helpers";

// Ids fijos del seed (supabase/seed.sql).
const ADULT_ID = "00000000-0000-4000-8000-000000000101";
const CHILD_ID = "00000000-0000-4000-8000-000000000102";
const BUCKET = "product-photos";

let member: TestUser;
let outsider: TestUser;
const createdProductIds: string[] = [];
const uploadedPaths: string[] = [];

beforeAll(async () => {
  member = await createTestUser({ name: "Beto Staff", role: "staff" });
  outsider = await createTestUser();
});

afterAll(async () => {
  if (createdProductIds.length) await adminDb.from("products").delete().in("id", createdProductIds);
  if (uploadedPaths.length) await adminDb.storage.from(BUCKET).remove(uploadedPaths);
  await deleteTestUsers([outsider, member]);
});

function productJson(overrides: Record<string, unknown> = {}) {
  return {
    slug: `prueba-${randomUUID()}`,
    name: "Tour de prueba",
    description: "",
    meeting_point: "Plaza",
    place: "Anaga",
    duration_min: 90,
    capacity: 10,
    min_pax: 2,
    pickup: false,
    color: "#30B158",
    photo_path: null,
    active: true,
    ...overrides,
  };
}

const RULES = [{ weekdays: [1, 3], times: ["09:00", "17:30"], language: "es", valid_from: "2026-11-01", valid_to: null }];

describe("save_product", () => {
  it("el equipo crea un producto con precios y reglas en una sola llamada", async () => {
    const { data: saved, error } = await member.db.rpc("save_product", {
      p_product: productJson(),
      p_prices: [
        { ticket_type_id: ADULT_ID, price_cents: 3900 },
        { ticket_type_id: CHILD_ID, price_cents: 0 },
      ],
      p_rules: RULES,
    });
    expect(error).toBeNull();
    const { id } = saved as { id: string };
    createdProductIds.push(id);
    expect(saved).toEqual({ id, previous_photo_path: null });

    const { data } = await member.db
      .from("products")
      .select("min_pax, product_prices(ticket_type_id, price_cents), schedule_rules(weekdays, times, language, valid_from, valid_to)")
      .eq("id", id)
      .single();
    expect(data?.min_pax).toBe(2);
    expect(data?.product_prices).toHaveLength(2);
    expect(data?.schedule_rules).toEqual([
      { weekdays: [1, 3], times: ["09:00:00", "17:30:00"], language: "es", valid_from: "2026-11-01", valid_to: null },
    ]);
  });

  it("al editar sustituye precios y reglas, y no cambia el slug ni «a la venta»", async () => {
    const product = productJson({ photo_path: `${randomUUID()}.jpg` });
    const { data: created } = await member.db.rpc("save_product", {
      p_product: product,
      p_prices: [{ ticket_type_id: ADULT_ID, price_cents: 3900 }],
      p_rules: RULES,
    });
    const { id } = created as { id: string };
    createdProductIds.push(id);

    const { data: saved, error } = await member.db.rpc("save_product", {
      p_id: id,
      p_product: productJson({ name: "Tour renombrado", slug: "otro-slug", active: false, photo_path: null }),
      p_prices: [{ ticket_type_id: CHILD_ID, price_cents: 1500 }],
      p_rules: [],
    });
    expect(error).toBeNull();
    expect(saved).toEqual({ id, previous_photo_path: product.photo_path });

    const { data } = await member.db
      .from("products")
      .select("slug, name, active, photo_path, product_prices(ticket_type_id, price_cents), schedule_rules(id)")
      .eq("id", id)
      .single();
    expect(data).toEqual({
      slug: product.slug,
      name: "Tour renombrado",
      active: true,
      photo_path: null,
      product_prices: [{ ticket_type_id: CHILD_ID, price_cents: 1500 }],
      schedule_rules: [],
    });
  });

  it("guarda los textos en inglés y, si no llegan, los deja vacíos", async () => {
    const english = { name_en: "Test tour", description_en: "A walk.", meeting_point_en: "Square" };
    const { data: created, error } = await member.db.rpc("save_product", {
      p_product: productJson(english),
      p_prices: [{ ticket_type_id: ADULT_ID, price_cents: 3900 }],
      p_rules: [],
    });
    expect(error).toBeNull();
    const { id } = created as { id: string };
    createdProductIds.push(id);
    const read = () => member.db.from("products").select("name_en, description_en, meeting_point_en").eq("id", id).single();
    expect((await read()).data).toEqual(english);

    await member.db.rpc("save_product", {
      p_id: id,
      p_product: productJson(),
      p_prices: [{ ticket_type_id: ADULT_ID, price_cents: 3900 }],
      p_rules: [],
    });
    expect((await read()).data).toEqual({ name_en: "", description_en: "", meeting_point_en: "" });

    const tooLong = await member.db.rpc("save_product", {
      p_id: id,
      p_product: productJson({ name_en: "x".repeat(121) }),
      p_prices: [{ ticket_type_id: ADULT_ID, price_cents: 3900 }],
      p_rules: [],
    });
    expect(tooLong.error?.code).toBe("23514");
  });

  it("si algo falla no guarda nada (una sola transacción)", async () => {
    const product = productJson();
    const { error } = await member.db.rpc("save_product", {
      p_product: product,
      p_prices: [{ ticket_type_id: ADULT_ID, price_cents: 3900 }],
      // Día 8 no existe: falla el check de schedule_rules después de insertar el producto.
      p_rules: [{ ...RULES[0], weekdays: [8] }],
    });
    expect(error).not.toBeNull();
    const { data } = await adminDb.from("products").select("id").eq("slug", product.slug);
    expect(data).toEqual([]);
  });

  it("editar un producto que no existe da error", async () => {
    const { error } = await member.db.rpc("save_product", {
      p_id: randomUUID(),
      p_product: productJson(),
      p_prices: [],
      p_rules: [],
    });
    expect(error?.code).toBe("P0002");
  });

  it("anon no puede ejecutarla y quien no es del equipo no puede guardar", async () => {
    const args = { p_product: productJson(), p_prices: [], p_rules: [] };
    const anon = await anonDb().rpc("save_product", args);
    expect(anon.error).not.toBeNull();
    const outside = await outsider.db.rpc("save_product", args);
    expect(outside.error?.code).toBe("42501");
  });

  it("quien no es del equipo no puede editar (RLS le oculta el producto)", async () => {
    const { data: created } = await member.db.rpc("save_product", {
      p_product: productJson(),
      p_prices: [{ ticket_type_id: ADULT_ID, price_cents: 3900 }],
      p_rules: [],
    });
    const { id } = created as { id: string };
    createdProductIds.push(id);

    const { error } = await outsider.db.rpc("save_product", {
      p_id: id,
      p_product: productJson({ name: "Hackeado" }),
      p_prices: [],
      p_rules: [],
    });
    expect(error?.code).toBe("P0002");
    const { data } = await adminDb.from("products").select("name").eq("id", id).single();
    expect(data?.name).toBe("Tour de prueba");
  });
});

describe("fotos de producto en Storage", () => {
  const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: "image/png" });

  it("el bucket es público, de imágenes y como mucho 5 MB", async () => {
    const { data } = await adminDb.storage.getBucket(BUCKET);
    expect(data).toMatchObject({
      public: true,
      file_size_limit: 5 * 1024 * 1024,
      allowed_mime_types: ["image/jpeg", "image/png", "image/webp"],
    });
  });

  it("el equipo sube y borra fotos", async () => {
    const path = `${randomUUID()}.png`;
    uploadedPaths.push(path);
    const upload = await member.db.storage.from(BUCKET).upload(path, png, { contentType: "image/png" });
    expect(upload.error).toBeNull();
    const removed = await member.db.storage.from(BUCKET).remove([path]);
    expect(removed.error).toBeNull();
    expect(removed.data).toHaveLength(1);
  });

  it("no admite archivos que no sean imágenes", async () => {
    const path = `${randomUUID()}.png`;
    uploadedPaths.push(path);
    const { error } = await member.db.storage
      .from(BUCKET)
      .upload(path, new Blob(["<script>"], { type: "text/html" }), { contentType: "text/html" });
    expect(error).not.toBeNull();
  });

  it("anon y quien no es del equipo no pueden borrar fotos", async () => {
    const path = `${randomUUID()}.png`;
    uploadedPaths.push(path);
    await member.db.storage.from(BUCKET).upload(path, png, { contentType: "image/png" });
    for (const db of [anonDb(), outsider.db]) {
      const { data } = await db.storage.from(BUCKET).remove([path]);
      expect(data ?? []).toEqual([]);
    }
    const { data: still } = await adminDb.storage.from(BUCKET).list("", { search: path });
    expect(still?.map((file) => file.name)).toEqual([path]);
  });

  it("anon y quien no es del equipo no pueden subir", async () => {
    for (const db of [anonDb(), outsider.db]) {
      const path = `${randomUUID()}.png`;
      uploadedPaths.push(path);
      const { error } = await db.storage.from(BUCKET).upload(path, png, { contentType: "image/png" });
      expect(error).not.toBeNull();
    }
  });
});
