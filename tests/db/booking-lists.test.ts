import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adminDb, anonDb, createTestUser, deleteTestUsers, type TestUser } from "./helpers";

// Ids fijos del seed (supabase/seed.sql).
const ADULT_ID = "00000000-0000-4000-8000-000000000101";

// Fecha lejana que no usa ningún otro test.
const DAY = "2031-06-11";
const PRODUCT_NAME = "Tour de listados (test)";

let member: TestUser;
let outsider: TestUser;
let sessionId: string;
const productIds: string[] = [];
const testTag = randomUUID().slice(0, 8);
const email = `cliente-${testTag}@example.test`;

beforeAll(async () => {
  member = await createTestUser({ name: "Lola Staff", role: "staff" });
  outsider = await createTestUser();
  const { data, error } = await member.db.rpc("save_product", {
    p_product: {
      slug: `listados-${randomUUID()}`,
      name: PRODUCT_NAME,
      description: "",
      meeting_point: "",
      place: "",
      duration_min: 60,
      capacity: 20,
      min_pax: 1,
      pickup: false,
      color: "#0A84FF",
      photo_path: null,
      active: true,
    },
    p_prices: [{ ticket_type_id: ADULT_ID, price_cents: 2500 }],
    p_rules: [{ weekdays: [1, 2, 3, 4, 5, 6, 7], times: ["10:00"], language: "es", valid_from: null, valid_to: null }],
  });
  if (error) throw error;
  const { id } = data as { id: string };
  productIds.push(id);
  expect((await member.db.rpc("generate_sessions", { p_from: DAY, p_to: DAY, p_product_id: id })).error).toBeNull();
  const { data: session, error: sessionError } = await adminDb.from("sessions").select("id").eq("product_id", id).single();
  if (sessionError) throw sessionError;
  sessionId = session.id;
});

afterAll(async () => {
  const { data: sessions } = await adminDb.from("sessions").select("id").in("product_id", productIds);
  const ids = sessions?.map((session) => session.id) ?? [];
  if (ids.length) await adminDb.from("bookings").delete().in("session_id", ids);
  await adminDb.from("products").delete().in("id", productIds);
  await adminDb.from("customers").delete().like("email", `%-${testTag}@example.test`);
  await deleteTestUsers([outsider, member]);
});

async function book(qty: number, channel = "phone", payment?: "on_site"): Promise<string> {
  const db = channel === "web" ? adminDb : member.db;
  const { data, error } = await db.rpc("create_booking_hold", {
    p_session_id: sessionId,
    p_lines: [{ ticket_type_id: ADULT_ID, qty }],
    p_customer: { name: "Marta Listado", email },
    p_booking: payment ? { channel, payment } : { channel },
  });
  if (error) throw error;
  return (data as { id: string }).id;
}

describe("listado de reservas y clientes", () => {
  it("lista confirmadas y canceladas con pasajeros y entradas, sin las web sin confirmar", async () => {
    const confirmed = await book(2);
    const cancelled = await book(1);
    expect((await member.db.rpc("booking_cancel", { p_booking_id: cancelled })).error).toBeNull();
    const webHold = await book(1, "web");
    // Web de «paga allí» que luego se cancela: sí es una reserva de verdad y sale.
    const payOnSite = await book(1, "web", "on_site");
    expect((await member.db.rpc("booking_cancel", { p_booking_id: payOnSite })).error).toBeNull();

    const { data, error } = await member.db
      .from("booking_list")
      .select("id, status, pax, lines, product_name, customer_email, search_text")
      .eq("session_id", sessionId)
      .order("status");
    expect(error).toBeNull();
    expect(data?.map((row) => row.id).sort()).toEqual([confirmed, cancelled, payOnSite].sort());
    expect(data?.map((row) => row.id)).not.toContain(webHold);
    const row = data?.find((item) => item.id === confirmed);
    expect(row).toMatchObject({ status: "confirmed", pax: 2, product_name: PRODUCT_NAME, customer_email: email });
    expect(row?.lines).toEqual([{ ticketName: "Adulto", qty: 2 }]);
    expect(row?.search_text).toContain("marta listado");

    // Cliente: 3 reservas, pero pasajeros y gasto solo de la confirmada.
    const { data: customer } = await member.db.from("customer_list").select("bookings, pax, spent_cents").eq("email", email).single();
    expect(customer).toEqual({ bookings: 3, pax: 2, spent_cents: 5000 });
  });

  it("quien no es del equipo no ve nada", async () => {
    for (const db of [anonDb(), outsider.db]) {
      const bookings = await db.from("booking_list").select("id").eq("session_id", sessionId);
      expect(bookings.data ?? []).toEqual([]);
      const customers = await db.from("customer_list").select("id").eq("email", email);
      expect(customers.data ?? []).toEqual([]);
    }
  });
});
