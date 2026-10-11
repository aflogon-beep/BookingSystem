import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adminDb, anonDb, createTestUser, deleteTestUsers, type TestUser } from "./helpers";

// Ids fijos del seed (supabase/seed.sql).
const ADULT_ID = "00000000-0000-4000-8000-000000000101";
const CHILD_ID = "00000000-0000-4000-8000-000000000102";
const BABY_ID = "00000000-0000-4000-8000-000000000103";

// Fecha lejana para no cruzarse con el seed, los e2e ni otros tests.
const DAY = "2031-05-21";
const PRODUCT_NAME = "Tour de editar reservas (test)";

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
  member = await createTestUser({ name: "Pablo Oficina", role: "staff" });
  outsider = await createTestUser();
});

afterAll(async () => {
  await removeTestProducts(productIds);
  await adminDb.from("customers").delete().like("email", `%-${testTag}@example.test`);
  await deleteTestUsers([outsider, member]);
});

/** Producto de prueba (adulto 50 €, niño 20 €, bebé gratis) con una salida el día DAY. */
async function createSession(capacity: number): Promise<{ sessionId: string; productId: string }> {
  const { data, error } = await member.db.rpc("save_product", {
    p_product: {
      slug: `editar-${randomUUID()}`,
      name: PRODUCT_NAME,
      description: "",
      meeting_point: "",
      place: "",
      duration_min: 60,
      capacity,
      min_pax: 1,
      pickup: true,
      color: "#0A84FF",
      photo_path: null,
      active: true,
    },
    p_prices: [
      { ticket_type_id: ADULT_ID, price_cents: 5000 },
      { ticket_type_id: CHILD_ID, price_cents: 2000 },
      { ticket_type_id: BABY_ID, price_cents: 0 },
    ],
    p_rules: [{ weekdays: [1, 2, 3, 4, 5, 6, 7], times: ["10:00"], language: "es", valid_from: null, valid_to: null }],
  });
  if (error) throw error;
  const { id: productId } = data as { id: string };
  productIds.push(productId);
  const generated = await member.db.rpc("generate_sessions", { p_from: DAY, p_to: DAY, p_product_id: productId });
  if (generated.error) throw generated.error;
  const { data: session, error: sessionError } = await adminDb.from("sessions").select("id").eq("product_id", productId).single();
  if (sessionError) throw sessionError;
  return { sessionId: session.id, productId };
}

async function book(sessionId: string, adults: number, paymentMethod = ""): Promise<string> {
  const { data, error } = await member.db.rpc("create_booking_hold", {
    p_session_id: sessionId,
    p_lines: [{ ticket_type_id: ADULT_ID, qty: adults }],
    p_customer: { name: "Ana Ruiz", email: `${randomUUID().slice(0, 8)}-${testTag}@example.test`, phone: "600111222" },
    p_booking: { channel: "phone", payment_method: paymentMethod },
  });
  if (error) throw error;
  return (data as { id: string }).id;
}

async function lastEvent(id: string): Promise<string | undefined> {
  const { data } = await adminDb.from("booking_events").select("text").eq("booking_id", id).order("created_at");
  return data?.at(-1)?.text;
}

describe("cambiar entradas", () => {
  it("recalcula el total, mantiene el precio de las que ya tenía y deja historial", async () => {
    const { sessionId, productId } = await createSession(10);
    const id = await book(sessionId, 2);
    // El precio del adulto sube después de reservar: la reserva mantiene los 50 €.
    await adminDb.from("product_prices").update({ price_cents: 6000 }).eq("product_id", productId).eq("ticket_type_id", ADULT_ID);

    const { data, error } = await member.db.rpc("booking_update_lines", {
      p_booking_id: id,
      p_lines: [
        { ticket_type_id: ADULT_ID, qty: 3 },
        { ticket_type_id: CHILD_ID, qty: 1 },
        { ticket_type_id: BABY_ID, qty: 1 },
      ],
    });
    expect(error).toBeNull();
    expect(data).toBe(17000);
    const { data: booking } = await adminDb.from("bookings").select("total_cents").eq("id", id).single();
    expect(booking?.total_cents).toBe(17000);
    expect(await lastEvent(id)).toBe("Entradas cambiadas: 2 adulto → 3 adulto · 1 niño · 1 bebé · total 170,00 €");
  });

  it("no pasa del aforo ni cambia reservas pagadas", async () => {
    const { sessionId } = await createSession(4);
    const id = await book(sessionId, 2);
    await book(sessionId, 1);
    const full = await member.db.rpc("booking_update_lines", { p_booking_id: id, p_lines: [{ ticket_type_id: ADULT_ID, qty: 4 }] });
    expect(full.error?.code).toBe("RB001");
    expect(full.error?.hint).toBe("1");
    // Reducir siempre se puede.
    expect((await member.db.rpc("booking_update_lines", { p_booking_id: id, p_lines: [{ ticket_type_id: ADULT_ID, qty: 1 }] })).error).toBeNull();
    // Solo bebés (sin plaza): no.
    const noSeat = await member.db.rpc("booking_update_lines", { p_booking_id: id, p_lines: [{ ticket_type_id: BABY_ID, qty: 1 }] });
    expect(noSeat.error?.code).toBe("RB003");

    const paid = await book(sessionId, 1, "cash");
    const change = await member.db.rpc("booking_update_lines", { p_booking_id: paid, p_lines: [{ ticket_type_id: ADULT_ID, qty: 2 }] });
    expect(change.error?.code).toBe("RB013");
  });

  it("solo el equipo", async () => {
    const { sessionId } = await createSession(10);
    const id = await book(sessionId, 1);
    const lines = [{ ticket_type_id: ADULT_ID, qty: 2 }];
    expect((await outsider.db.rpc("booking_update_lines", { p_booking_id: id, p_lines: lines })).error).not.toBeNull();
    expect((await anonDb().rpc("booking_update_lines", { p_booking_id: id, p_lines: lines })).error).not.toBeNull();
  });
});

describe("corregir datos", () => {
  it("cambia cliente y hotel con historial y no hace nada si no cambia", async () => {
    const { sessionId } = await createSession(10);
    const id = await book(sessionId, 1);
    const email = `nuevo-${testTag}@example.test`;
    const details = { name: "Ana Ruiz Gil", email, phone: "600111222", hotel: "Hotel Mar" };
    expect((await member.db.rpc("booking_update_details", { p_booking_id: id, p_details: details })).error).toBeNull();
    const { data } = await adminDb.from("bookings").select("hotel, customers!inner(name, email, phone)").eq("id", id).single();
    expect(data).toMatchObject({ hotel: "Hotel Mar", customers: { name: "Ana Ruiz Gil", email, phone: "600111222" } });
    expect(await lastEvent(id)).toBe("Datos cambiados: nombre, email, hotel");

    await member.db.rpc("booking_update_details", { p_booking_id: id, p_details: details });
    expect(await lastEvent(id)).toBe("Datos cambiados: nombre, email, hotel");

    const empty = await member.db.rpc("booking_update_details", { p_booking_id: id, p_details: { ...details, name: " " } });
    expect(empty.error?.code).toBe("22023");
    expect((await outsider.db.rpc("booking_update_details", { p_booking_id: id, p_details: details })).error).not.toBeNull();
  });
});
