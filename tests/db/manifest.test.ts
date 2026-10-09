import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adminDb, anonDb, createTestUser, deleteTestUsers, type TestUser } from "./helpers";

// Ids fijos del seed (supabase/seed.sql).
const ADULT_ID = "00000000-0000-4000-8000-000000000101";

// Fecha lejana para no cruzarse con el seed, los e2e ni bookings.test.ts.
const DAY = "2031-04-16";
const PRODUCT_NAME = "Tour de manifiesto (test)";

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
  member = await createTestUser({ name: "Marta Guía", role: "staff" });
  outsider = await createTestUser();
});

afterAll(async () => {
  await removeTestProducts(productIds);
  await adminDb.from("customers").delete().like("email", `%-${testTag}@example.test`);
  await deleteTestUsers([outsider, member]);
});

/** Producto de prueba (adulto 50 €) con una salida el día DAY a las 10:00. */
async function createSession(capacity = 10): Promise<string> {
  const { data, error } = await member.db.rpc("save_product", {
    p_product: {
      slug: `manifiesto-${randomUUID()}`,
      name: PRODUCT_NAME,
      description: "",
      meeting_point: "",
      place: "",
      duration_min: 60,
      capacity,
      min_pax: 1,
      pickup: false,
      color: "#0A84FF",
      photo_path: null,
      active: true,
    },
    p_prices: [{ ticket_type_id: ADULT_ID, price_cents: 5000 }],
    p_rules: [{ weekdays: [1, 2, 3, 4, 5, 6, 7], times: ["10:00"], language: "es", valid_from: null, valid_to: null }],
  });
  if (error) throw error;
  const { id: productId } = data as { id: string };
  productIds.push(productId);
  const generated = await member.db.rpc("generate_sessions", { p_from: DAY, p_to: DAY, p_product_id: productId });
  if (generated.error) throw generated.error;
  const { data: session, error: sessionError } = await adminDb.from("sessions").select("id").eq("product_id", productId).single();
  if (sessionError) throw sessionError;
  return session.id;
}

async function book(sessionId: string, qty: number, paymentMethod: string | null = null): Promise<string> {
  const { data, error } = await member.db.rpc("create_booking_hold", {
    p_session_id: sessionId,
    p_lines: [{ ticket_type_id: ADULT_ID, qty }],
    p_customer: { name: "Lucía Pérez", email: `${randomUUID().slice(0, 8)}-${testTag}@example.test` },
    p_booking: { channel: "phone", payment_method: paymentMethod ?? "" },
  });
  if (error) throw error;
  return (data as { id: string }).id;
}

async function bookingRow(id: string) {
  const { data, error } = await adminDb
    .from("bookings")
    .select("status, payment_status, payment_method, paid_cents, checked_in")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

async function events(id: string): Promise<string[]> {
  const { data } = await adminDb.from("booking_events").select("actor, text").eq("booking_id", id).order("created_at");
  return (data ?? []).map((event) => `${event.actor}: ${event.text}`);
}

describe("check-in", () => {
  it("marca y desmarca una reserva y lo deja en el historial", async () => {
    const sessionId = await createSession();
    const id = await book(sessionId, 2);

    expect((await member.db.rpc("booking_set_checked_in", { p_booking_id: id, p_checked: true })).data).toBe(true);
    // Repetirlo no duplica el historial.
    await member.db.rpc("booking_set_checked_in", { p_booking_id: id, p_checked: true });
    expect((await bookingRow(id)).checked_in).toBe(true);
    await member.db.rpc("booking_set_checked_in", { p_booking_id: id, p_checked: false });
    expect((await bookingRow(id)).checked_in).toBe(false);
    expect(await events(id)).toEqual([
      "Marta Guía: Reserva creada",
      "Marta Guía: Check-in realizado",
      "Marta Guía: Check-in deshecho",
    ]);
  });

  it("«Marcar todos» marca solo las confirmadas que faltan", async () => {
    const sessionId = await createSession();
    const first = await book(sessionId, 1);
    await book(sessionId, 1);
    await member.db.rpc("booking_set_checked_in", { p_booking_id: first, p_checked: true });

    const { data, error } = await member.db.rpc("session_check_in_all", { p_session_id: sessionId });
    expect(error).toBeNull();
    expect(data).toBe(1);
    const { data: rows } = await adminDb.from("bookings").select("checked_in").eq("session_id", sessionId);
    expect(rows?.every((row) => row.checked_in)).toBe(true);
  });
});

describe("cobro en destino", () => {
  it("cobra el total de una reserva pendiente una sola vez", async () => {
    const sessionId = await createSession();
    const id = await book(sessionId, 2);

    const { error } = await member.db.rpc("booking_collect_payment", { p_booking_id: id, p_method: "cash" });
    expect(error).toBeNull();
    expect(await bookingRow(id)).toMatchObject({ payment_status: "paid", payment_method: "cash", paid_cents: 10000 });
    expect((await events(id)).at(-1)).toBe("Marta Guía: Cobrado 100,00 € · Efectivo");

    const again = await member.db.rpc("booking_collect_payment", { p_booking_id: id, p_method: "card_terminal" });
    expect(again.error?.code).toBe("RB005");
  });

  it("no cobra facturas a agencia ni acepta otros métodos", async () => {
    const sessionId = await createSession();
    const invoice = await book(sessionId, 1, "invoice");
    expect((await member.db.rpc("booking_collect_payment", { p_booking_id: invoice, p_method: "cash" })).error?.code).toBe("RB005");
    const pending = await book(sessionId, 1);
    expect((await member.db.rpc("booking_collect_payment", { p_booking_id: pending, p_method: "invoice" })).error?.code).toBe("22023");
  });
});

describe("estado de la salida", () => {
  it("cerrar impide reservar y volver a abrir lo permite", async () => {
    const sessionId = await createSession();
    expect((await member.db.rpc("session_set_status", { p_session_id: sessionId, p_status: "closed" })).error).toBeNull();
    await expect(book(sessionId, 1)).rejects.toMatchObject({ code: "RB002" });
    expect((await member.db.rpc("session_set_status", { p_session_id: sessionId, p_status: "open" })).error).toBeNull();
    await expect(book(sessionId, 1)).resolves.toBeTypeOf("string");
  });

  it("cancelar cancela sus reservas y bloquea el check-in", async () => {
    const sessionId = await createSession();
    const a = await book(sessionId, 2);
    const b = await book(sessionId, 1, "cash");

    const { data, error } = await member.db.rpc("session_set_status", { p_session_id: sessionId, p_status: "cancelled" });
    expect(error).toBeNull();
    expect(data).toBe(2);
    expect((await bookingRow(a)).status).toBe("cancelled");
    // Lo cobrado sigue como pagado: el reembolso llega con la tarea 2.4.
    expect(await bookingRow(b)).toMatchObject({ status: "cancelled", payment_status: "paid" });
    expect((await events(a)).at(-1)).toBe("Marta Guía: Reserva cancelada: salida cancelada por la empresa");
    expect((await member.db.rpc("booking_set_checked_in", { p_booking_id: a, p_checked: true })).error?.code).toBe("RB004");
  });

  it("el aforo de la salida no baja de las plazas ocupadas", async () => {
    const sessionId = await createSession();
    await book(sessionId, 3);
    const tooLow = await member.db.from("sessions").update({ capacity: 2, capacity_custom: true }).eq("id", sessionId);
    expect(tooLow.error?.code).toBe("RB001");
    expect(tooLow.error?.hint).toBe("3");
    const ok = await member.db.from("sessions").update({ capacity: 3, capacity_custom: true }).eq("id", sessionId);
    expect(ok.error).toBeNull();
  });
});

describe("permisos", () => {
  it("solo el equipo usa las funciones del manifiesto", async () => {
    const sessionId = await createSession();
    const id = await book(sessionId, 1);
    for (const db of [outsider.db, anonDb()]) {
      expect((await db.rpc("booking_set_checked_in", { p_booking_id: id, p_checked: true })).error).not.toBeNull();
      expect((await db.rpc("session_check_in_all", { p_session_id: sessionId })).error).not.toBeNull();
      expect((await db.rpc("booking_collect_payment", { p_booking_id: id, p_method: "cash" })).error).not.toBeNull();
      expect((await db.rpc("session_set_status", { p_session_id: sessionId, p_status: "cancelled" })).error).not.toBeNull();
    }
    expect(await bookingRow(id)).toMatchObject({ status: "confirmed", payment_status: "pending", checked_in: false });
    // Las funciones auxiliares no se exponen.
    expect((await member.db.rpc("staff_actor")).error).not.toBeNull();
    expect((await member.db.rpc("format_cents", { p_cents: 100 })).error).not.toBeNull();
  });
});
