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
    expect(saved).toEqual({ id, previous_photo_path: null, previous_photo_paths: [] });

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
    expect(saved).toEqual({
      id,
      previous_photo_path: product.photo_path,
      previous_photo_paths: product.photo_path ? [product.photo_path] : [],
    });

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

  it("los textos en inglés de las entradas tienen el mismo límite que en español", async () => {
    const { error } = await adminDb.from("ticket_types").update({ note_en: "x".repeat(121) }).eq("id", ADULT_ID);
    expect(error?.code).toBe("23514");
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

describe("ficha web del producto", () => {
  const photo = () => `${randomUUID()}.jpg`;

  it("save_product guarda la ficha, el itinerario y la galería, y devuelve las fotos anteriores", async () => {
    const cover = photo();
    const extra = [photo(), photo()];
    const { data: created, error } = await member.db.rpc("save_product", {
      p_product: {
        ...productJson({ photo_path: cover }),
        content: {
          tagline: "Bosque de niebla",
          tagline_en: "Cloud forest",
          highlights: ["Laurisilva", "Caserío"],
          highlights_en: [],
          included: ["Guía"],
          included_en: ["Guide"],
          not_included: [],
          not_included_en: [],
          bring: ["Agua"],
          bring_en: [],
          good_to_know: "Calzado de montaña.",
          good_to_know_en: "",
          difficulty: "moderate",
        },
        stops: [
          { title: "Cruz del Carmen", title_en: "", description: "Inicio", description_en: "", duration_min: 15 },
          { title: "Chinamada", title_en: "", description: "", description_en: "", duration_min: null },
        ],
        gallery: extra,
      },
      p_prices: [{ ticket_type_id: ADULT_ID, price_cents: 3900 }],
      p_rules: [],
    });
    expect(error).toBeNull();
    const { id } = created as { id: string };
    createdProductIds.push(id);

    const { data: product } = await member.db
      .from("products")
      .select("tagline, tagline_en, highlights, included_en, bring, good_to_know, difficulty, product_stops(position, title, duration_min), product_photos(path, position)")
      .eq("id", id)
      .single();
    expect(product).toMatchObject({
      tagline: "Bosque de niebla",
      tagline_en: "Cloud forest",
      highlights: ["Laurisilva", "Caserío"],
      included_en: ["Guide"],
      bring: ["Agua"],
      good_to_know: "Calzado de montaña.",
      difficulty: "moderate",
    });
    expect(product?.product_stops.toSorted((a, b) => a.position - b.position)).toEqual([
      { position: 1, title: "Cruz del Carmen", duration_min: 15 },
      { position: 2, title: "Chinamada", duration_min: null },
    ]);
    expect(product?.product_photos.toSorted((a, b) => a.position - b.position).map((row) => row.path)).toEqual(extra);

    // Al editar sin ficha (como el asistente), se queda como estaba; con galería vacía, se vacía.
    const { data: edited, error: editError } = await member.db.rpc("save_product", {
      p_id: id,
      p_product: { ...productJson({ photo_path: null }), gallery: [] },
      p_prices: [{ ticket_type_id: ADULT_ID, price_cents: 3900 }],
      p_rules: [],
    });
    expect(editError).toBeNull();
    expect((edited as { previous_photo_paths: string[] }).previous_photo_paths).toEqual([cover, ...extra]);
    const { data: after } = await member.db
      .from("products")
      .select("tagline, product_stops(title), product_photos(path)")
      .eq("id", id)
      .single();
    expect(after?.tagline).toBe("Bosque de niebla");
    expect(after?.product_stops).toHaveLength(2);
    expect(after?.product_photos).toEqual([]);
  });

  it("la BD rechaza listas con líneas vacías, dificultades desconocidas y rutas de foto raras", async () => {
    const base = { p_prices: [{ ticket_type_id: ADULT_ID, price_cents: 100 }], p_rules: [] };
    const empty = await member.db.rpc("save_product", {
      ...base,
      p_product: { ...productJson(), content: { highlights: ["Bien", " "] } },
    });
    expect(empty.error?.code).toBe("23514");
    const difficulty = await member.db.rpc("save_product", {
      ...base,
      p_product: { ...productJson(), content: { difficulty: "extrema" } },
    });
    expect(difficulty.error?.code).toBe("23514");
    const path = await member.db.rpc("save_product", {
      ...base,
      p_product: { ...productJson(), gallery: ["../otro-bucket/x.jpg"] },
    });
    expect(path.error?.code).toBe("23514");
  });

  it("anon y quien no es del equipo no ven ni tocan paradas ni galería", async () => {
    for (const db of [anonDb(), outsider.db]) {
      for (const table of ["product_stops", "product_photos"] as const) {
        const { data } = await db.from(table).select("product_id");
        expect(data ?? []).toEqual([]);
      }
      const { error } = await db
        .from("product_stops")
        .insert({ product_id: "00000000-0000-4000-8000-000000000201", position: 9, title: "Intrusa" });
      expect(error).not.toBeNull();
      const { error: photoError } = await db
        .from("product_photos")
        .insert({ product_id: "00000000-0000-4000-8000-000000000201", position: 9, path: photo() });
      expect(photoError).not.toBeNull();
    }
  });
});
