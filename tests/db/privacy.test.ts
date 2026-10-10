import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adminDb, anonDb, createTestUser, deleteTestUsers, type TestUser } from "./helpers";

// Ids fijos del seed (supabase/seed.sql).
const ADULT_ID = "00000000-0000-4000-8000-000000000101";

// Fecha lejana para no cruzarse con el seed ni con los demás tests.
const DAY = "2031-05-20";
const PRODUCT_NAME = "Tour de privacidad (test)";

let member: TestUser;
let boss: TestUser;
const productIds: string[] = [];
const customerIds: string[] = [];
const testTag = randomUUID().slice(0, 8);

beforeAll(async () => {
  member = await createTestUser({ name: "Marta Guía", role: "staff" });
  boss = await createTestUser({ name: "Rosa Admin", role: "admin" });
});

afterAll(async () => {
  if (productIds.length) {
    const { data: sessions } = await adminDb.from("sessions").select("id").in("product_id", productIds);
    const sessionIds = sessions?.map((session) => session.id) ?? [];
    if (sessionIds.length) await adminDb.from("bookings").delete().in("session_id", sessionIds);
    await adminDb.from("products").delete().in("id", productIds);
  }
  if (customerIds.length) await adminDb.from("customers").delete().in("id", customerIds);
  await deleteTestUsers([member, boss]);
});

async function createSession(): Promise<string> {
  const { data, error } = await member.db.rpc("save_product", {
    p_product: {
      slug: `privacidad-${randomUUID()}`,
      name: PRODUCT_NAME,
      description: "",
      meeting_point: "",
      place: "",
      duration_min: 60,
      capacity: 10,
      min_pax: 1,
      pickup: true,
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

async function book(sessionId: string): Promise<{ bookingId: string; customerId: string }> {
  const { data, error } = await member.db.rpc("create_booking_hold", {
    p_session_id: sessionId,
    p_lines: [{ ticket_type_id: ADULT_ID, qty: 2 }],
    p_customer: { name: "Lucía Pérez", email: `${randomUUID().slice(0, 8)}-${testTag}@example.test`, phone: "+34 600 111 222" },
    p_booking: { channel: "phone", payment_method: "", hotel: "Hotel Mar", notes: "Alergia al marisco" },
  });
  if (error) throw error;
  const bookingId = (data as { id: string }).id;
  const { data: row, error: rowError } = await adminDb.from("bookings").select("customer_id").eq("id", bookingId).single();
  if (rowError) throw rowError;
  customerIds.push(row.customer_id);
  return { bookingId, customerId: row.customer_id };
}

describe("anonymize_customer", () => {
  it("solo un admin, nunca con reservas por venir, y borra los datos personales del cliente y de sus reservas", async () => {
    const { bookingId, customerId } = await book(await createSession());

    expect((await member.db.rpc("anonymize_customer", { p_customer_id: customerId })).error?.code).toBe("42501");
    expect((await anonDb().rpc("anonymize_customer", { p_customer_id: customerId })).error).not.toBeNull();
    expect((await boss.db.rpc("anonymize_customer", { p_customer_id: customerId })).error?.code).toBe("RB010");

    expect((await member.db.rpc("booking_cancel", { p_booking_id: bookingId })).error).toBeNull();
    expect((await boss.db.rpc("anonymize_customer", { p_customer_id: customerId })).error).toBeNull();

    const { data: customer } = await adminDb.from("customers").select("name, email, phone, anonymized_at").eq("id", customerId).single();
    expect(customer).toMatchObject({ name: "Cliente anonimizado", email: null, phone: null });
    expect(customer?.anonymized_at).not.toBeNull();
    const { data: booking } = await adminDb.from("bookings").select("hotel, notes, total_cents, status").eq("id", bookingId).single();
    expect(booking).toEqual({ hotel: "", notes: "", total_cents: 10000, status: "cancelled" });

    // Repetirlo no hace nada y no cambia la fecha.
    expect((await boss.db.rpc("anonymize_customer", { p_customer_id: customerId })).error).toBeNull();
    const { data: again } = await adminDb.from("customers").select("anonymized_at").eq("id", customerId).single();
    expect(again?.anonymized_at).toBe(customer?.anonymized_at);

    // Sus datos no pueden volver: nadie edita un cliente anonimizado ni le cuelga reservas.
    expect((await adminDb.from("customers").update({ name: "Lucía Pérez" }).eq("id", customerId)).error?.code).toBe("RB011");
    const { data: session } = await adminDb.from("bookings").select("session_id").eq("id", bookingId).single();
    const hung = await adminDb
      .from("bookings")
      .insert({ code: "VTZZ9999", session_id: session?.session_id ?? "", customer_id: customerId, channel: "phone", total_cents: 0 });
    expect(hung.error?.code).toBe("RB011");
  });

  it("el equipo solo edita nombre, email y teléfono, nunca la marca de anonimizado", async () => {
    const { customerId } = await book(await createSession());
    const mark = await member.db.from("customers").update({ anonymized_at: new Date().toISOString() }).eq("id", customerId);
    expect(mark.error?.code).toBe("42501");
    const phone = await member.db.from("customers").update({ phone: "+34 600 999 999" }).eq("id", customerId).select("phone");
    expect(phone.error).toBeNull();
    expect(phone.data).toEqual([{ phone: "+34 600 999 999" }]);
  });

  it("un cliente que no existe da P0002", async () => {
    expect((await boss.db.rpc("anonymize_customer", { p_customer_id: randomUUID() })).error?.code).toBe("P0002");
  });
});

// Ojo: la función recorre todos los clientes de la base compartida. Los clientes de los tests y del
// seed son de ahora, así que solo caen los creados aquí con fechas antiguas.
describe("anonymize_expired_customers", () => {
  it("con una fecha de referencia, el corte es exacto: cuenta el alta del cliente sin reservas", async () => {
    const { data, error } = await adminDb
      .from("customers")
      .insert([
        { name: "Antes del corte", email: `antes-${testTag}@example.test`, created_at: "2016-12-31T00:00:00Z" },
        { name: "Después del corte", email: `despues-${testTag}@example.test`, created_at: "2017-01-02T00:00:00Z" },
      ])
      .select("id, name");
    if (error) throw error;
    customerIds.push(...data.map((row) => row.id));
    // 24 meses antes de 2019-01-01 = 2017-01-01.
    expect((await adminDb.rpc("anonymize_expired_customers", { p_as_of: "2019-01-01T00:00:00Z" })).error).toBeNull();
    const { data: rows } = await adminDb.from("customers").select("id, anonymized_at").in("id", data.map((row) => row.id));
    const anonymized = new Map((rows ?? []).map((row) => [row.id, row.anonymized_at !== null]));
    expect(data.map((row) => [row.name, anonymized.get(row.id)])).toEqual([
      ["Antes del corte", true],
      ["Después del corte", false],
    ]);
  });

  it("anonimiza a quien pasó el plazo desde su última salida y deja a quien tiene salidas recientes", async () => {
    const { customerId: recent } = await book(await createSession());
    const { data: old, error } = await adminDb
      .from("customers")
      .insert({ name: "Pedro Antiguo", email: `antiguo-${testTag}@example.test`, created_at: "2020-01-01T00:00:00Z" })
      .select("id")
      .single();
    if (error) throw error;
    customerIds.push(old.id);
    // Aunque el cliente con reserva sea antiguo, su salida (2031) está dentro del plazo.
    await adminDb.from("customers").update({ created_at: "2020-01-01T00:00:00Z" }).eq("id", recent);

    const { data: count, error: runError } = await adminDb.rpc("anonymize_expired_customers");
    expect(runError).toBeNull();
    expect(count).toBeGreaterThanOrEqual(1);

    const { data: rows } = await adminDb.from("customers").select("id, name, anonymized_at").in("id", [old.id, recent]);
    const byId = new Map((rows ?? []).map((row) => [row.id, row]));
    expect(byId.get(old.id)?.name).toBe("Cliente anonimizado");
    expect(byId.get(recent)?.anonymized_at).toBeNull();
  });

  it("solo la llama el servidor", async () => {
    expect((await member.db.rpc("anonymize_expired_customers")).error).not.toBeNull();
    expect((await boss.db.rpc("anonymize_expired_customers")).error).not.toBeNull();
    expect((await anonDb().rpc("anonymize_expired_customers")).error).not.toBeNull();
  });
});
