import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { reportSummarySchema } from "@/lib/domain/reports";

import { adminDb, anonDb, createTestUser, deleteTestUsers, type TestUser } from "./helpers";

// Ids fijos del seed (supabase/seed.sql).
const ADULT_ID = "00000000-0000-4000-8000-000000000101";

// Fecha lejana que no usa ningún otro test. En julio Canarias va en UTC+1.
const DAY = "2031-07-09";

let member: TestUser;
let outsider: TestUser;
let productId: string;
const sessionIds: string[] = [];
const testTag = randomUUID().slice(0, 8);

beforeAll(async () => {
  member = await createTestUser({ name: "Rita Staff", role: "staff" });
  outsider = await createTestUser();
  const { data, error } = await member.db.rpc("save_product", {
    p_product: {
      slug: `informes-${randomUUID()}`,
      name: "Tour de informes (test)",
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
    },
    p_prices: [{ ticket_type_id: ADULT_ID, price_cents: 2500 }],
    // 00:30 de Canarias = 23:30 UTC del día anterior: cuenta en el día de Canarias.
    p_rules: [
      { weekdays: [1, 2, 3, 4, 5, 6, 7], times: ["00:30"], language: "en", valid_from: null, valid_to: null },
      { weekdays: [1, 2, 3, 4, 5, 6, 7], times: ["10:00"], language: "es", valid_from: null, valid_to: null },
    ],
  });
  if (error) throw error;
  productId = (data as { id: string }).id;
  expect((await member.db.rpc("generate_sessions", { p_from: DAY, p_to: DAY, p_product_id: productId })).error).toBeNull();
  const { data: sessions, error: sessionsError } = await adminDb.from("sessions").select("id").eq("product_id", productId).order("starts_at");
  if (sessionsError) throw sessionsError;
  sessionIds.push(...sessions.map((session) => session.id));
});

afterAll(async () => {
  if (sessionIds.length) await adminDb.from("bookings").delete().in("session_id", sessionIds);
  await adminDb.from("products").delete().eq("id", productId);
  await adminDb.from("customers").delete().like("email", `%-${testTag}@example.test`);
  await deleteTestUsers([outsider, member]);
});

async function book(sessionId: string, qty: number, channel: string): Promise<string> {
  const { data, error } = await member.db.rpc("create_booking_hold", {
    p_session_id: sessionId,
    p_lines: [{ ticket_type_id: ADULT_ID, qty }],
    p_customer: { name: "Cliente Informe", email: `informe-${testTag}@example.test` },
    p_booking: { channel },
  });
  if (error) throw error;
  return (data as { id: string }).id;
}

describe("report_summary", () => {
  it("suma confirmadas por día, producto, canal e idioma, sin las canceladas", async () => {
    const [early, late] = sessionIds;
    expect(sessionIds).toHaveLength(2);
    await book(early ?? "", 2, "phone");
    await book(late ?? "", 3, "desk");
    const cancelled = await book(late ?? "", 1, "desk");
    expect((await member.db.rpc("booking_cancel", { p_booking_id: cancelled })).error).toBeNull();

    const { data, error } = await member.db.rpc("report_summary", { p_from: DAY, p_to: DAY });
    expect(error).toBeNull();
    const summary = reportSummarySchema.parse(data);
    expect(summary).toMatchObject({ bookings: 2, revenue_cents: 12_500, pax: 5, capacity: 20, booked_seats: 5 });
    expect(summary.days).toEqual([{ day: DAY, revenue_cents: 12_500 }]);
    expect(summary.products.find((product) => product.id === productId)).toMatchObject({
      revenue_cents: 12_500,
      capacity: 20,
      booked_seats: 5,
    });
    expect(summary.channels).toEqual([
      { channel: "desk", revenue_cents: 7_500 },
      { channel: "phone", revenue_cents: 5_000 },
    ]);
    expect(summary.languages).toEqual([
      { language: "en", pax: 2 },
      { language: "es", pax: 3 },
    ]);
  });

  it("rechaza rangos de más de 3 meses", async () => {
    const { error } = await member.db.rpc("report_summary", { p_from: "2031-01-01", p_to: "2031-12-31" });
    expect(error?.code).toBe("22023");
  });

  it("quien no es del equipo no puede verlo", async () => {
    const { error: anonError } = await anonDb().rpc("report_summary", { p_from: DAY, p_to: DAY });
    expect(anonError).not.toBeNull();
    const { error } = await outsider.db.rpc("report_summary", { p_from: DAY, p_to: DAY });
    expect(error?.code).toBe("42501");
  });
});
