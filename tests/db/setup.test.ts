import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adminDb, createTestUser, deleteTestUsers, type TestUser } from "./helpers";

// Ids fijos del seed (supabase/seed.sql).
const ADULT_ID = "00000000-0000-4000-8000-000000000101";

let admin: TestUser;
let member: TestUser;
let settings: { business_name: string; currency: string; languages: string[] };
const tag = randomUUID().slice(0, 8);
const productIds: string[] = [];

beforeAll(async () => {
  admin = await createTestUser({ name: "Ada Admin", role: "admin" });
  member = await createTestUser({ name: "Sara Staff", role: "staff" });
  const { data, error } = await adminDb.from("settings").select("business_name, currency, languages").eq("id", 1).single();
  if (error) throw error;
  settings = data;
});

afterAll(async () => {
  if (productIds.length) await adminDb.from("products").delete().in("id", productIds);
  await adminDb.from("resources").delete().like("name", `%${tag}%`);
  await adminDb.from("ticket_types").delete().like("note", `%${tag}%`);
  await deleteTestUsers([member, admin]);
});

// Los ajustes se dejan como están (otros tests los usan): el asistente los reescribe con lo mismo.
function payload(name: string) {
  return {
    settings,
    ticket_types: [{ key: "vip", name: "VIP", note: `Test ${tag}`, takes_seat: true, sort: 90 }],
    resources: [
      { name: `Guía ${tag}`, type: "guide", seats: 1, languages: ["es"] },
      { name: `Minibús ${tag}`, type: "vehicle", seats: 16, languages: [] },
    ],
    product: {
      slug: `asistente-${randomUUID()}`,
      name,
      description: "",
      meeting_point: "Plaza",
      place: "",
      duration_min: 120,
      capacity: 12,
      min_pax: 2,
      pickup: false,
      color: "#0A84FF",
      photo_path: null,
      active: true,
      needs: { guide: 1, vehicle: 1, equipment: 0 },
    },
    prices: [
      { ticket: ADULT_ID, price_cents: 4500 },
      { ticket: "vip", price_cents: 9000 },
    ],
    rules: [{ weekdays: [1, 3, 5], times: ["10:00", "17:00"], language: "es", valid_from: null, valid_to: null }],
  };
}

describe("complete_setup", () => {
  it("solo un admin puede usarlo", async () => {
    const { error } = await member.db.rpc("complete_setup", { p: payload("Tour de staff (test)") });
    expect(error?.code).toBe("42501");
  });

  it("guarda negocio, entradas, equipo y primer tour de una vez", async () => {
    const { data: id, error } = await admin.db.rpc("complete_setup", { p: payload("Tour del asistente (test)") });
    if (error) throw error;
    productIds.push(id);

    const { data: done } = await adminDb.from("settings").select("setup_done_at, business_name").eq("id", 1).single();
    expect(done?.setup_done_at).not.toBeNull();
    expect(done?.business_name).toBe(settings.business_name);

    const { data: prices } = await adminDb
      .from("product_prices")
      .select("price_cents, ticket_types(name, note)")
      .eq("product_id", id)
      .order("price_cents");
    expect(prices).toEqual([
      { price_cents: 4500, ticket_types: { name: "Adulto", note: "13 años o más" } },
      { price_cents: 9000, ticket_types: { name: "VIP", note: `Test ${tag}` } },
    ]);

    const { data: needs } = await adminDb.from("product_needs").select("resource_type, qty").eq("product_id", id).order("resource_type");
    expect(needs).toEqual([
      { resource_type: "guide", qty: 1 },
      { resource_type: "vehicle", qty: 1 },
    ]);
    const { data: rules } = await adminDb.from("schedule_rules").select("weekdays, language").eq("product_id", id);
    expect(rules).toEqual([{ weekdays: [1, 3, 5], language: "es" }]);
    const { data: resources } = await adminDb.from("resources").select("type, seats, languages").like("name", `%${tag}%`).order("type");
    expect(resources).toEqual([
      { type: "guide", seats: 1, languages: ["es"] },
      { type: "vehicle", seats: 16, languages: [] },
    ]);
  });

  it("si algo falla no guarda nada", async () => {
    const bad = payload("Tour roto (test)");
    bad.settings = { ...settings, business_name: `Roto ${tag}` };
    bad.ticket_types = [{ key: "vip", name: "VIP roto", note: `Roto ${tag}`, takes_seat: true, sort: 91 }];
    bad.resources = [{ name: `Roto ${tag}`, type: "vehicle", seats: 1000, languages: [] }];
    const { error } = await admin.db.rpc("complete_setup", { p: bad });
    expect(error).not.toBeNull();
    const { data } = await adminDb.from("resources").select("id").eq("name", `Roto ${tag}`);
    expect(data).toEqual([]);
    const { data: products } = await adminDb.from("products").select("id").eq("name", "Tour roto (test)");
    expect(products).toEqual([]);
    const { data: tickets } = await adminDb.from("ticket_types").select("id").eq("note", `Roto ${tag}`);
    expect(tickets).toEqual([]);
    const { data: current } = await adminDb.from("settings").select("business_name").eq("id", 1).single();
    expect(current?.business_name).toBe(settings.business_name);
  });

  it("no deja quitar un idioma que usan los horarios", async () => {
    const bad = payload("Tour sin idioma (test)");
    bad.settings = { ...settings, languages: ["en"] };
    const { error } = await admin.db.rpc("complete_setup", { p: bad });
    expect(error?.message).toBe("Idioma en uso");
  });
});
