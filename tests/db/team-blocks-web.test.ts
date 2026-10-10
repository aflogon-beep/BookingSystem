import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adminDb, createTestUser, deleteTestUsers, type TestUser } from "./helpers";

// Ids fijos del seed (supabase/seed.sql). Lukas es el único guía del seed que guía en alemán: las
// salidas en alemán de estos tests tienen un solo guía posible, como una empresa con un guía.
const ADULT_ID = "00000000-0000-4000-8000-000000000101";
const LUKAS = "00000000-0000-4000-8000-000000000302";

// Fechas lejanas que no usa ningún otro test (una por caso): así Lukas está libre.
const DAYS = ["2031-07-14", "2031-07-15", "2031-07-16", "2031-07-17"] as const;
const PRODUCT_NAME = "Tour de equipo ocupado (test)";

let member: TestUser;
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
  member = await createTestUser({ name: "Eva Staff", role: "staff" });
});

afterAll(async () => {
  await removeTestProducts(productIds);
  await adminDb.from("customers").delete().like("email", `%-${testTag}@example.test`);
  await deleteTestUsers([member]);
});

/** Producto que necesita un guía, con una salida en alemán de 3 h ese día a esa hora. */
async function createSession(day: string, time: string): Promise<string> {
  const { data, error } = await member.db.rpc("save_product", {
    p_product: {
      slug: `equipo-${randomUUID()}`,
      name: PRODUCT_NAME,
      description: "",
      meeting_point: "",
      place: "",
      duration_min: 180,
      capacity: 10,
      min_pax: 1,
      pickup: false,
      color: "#0A84FF",
      photo_path: null,
      active: true,
      needs: { guide: 1, vehicle: 0, equipment: 0 },
    },
    p_prices: [{ ticket_type_id: ADULT_ID, price_cents: 5000 }],
    p_rules: [{ weekdays: [1, 2, 3, 4, 5, 6, 7], times: [time], language: "de", valid_from: null, valid_to: null }],
  });
  if (error) throw error;
  const { id: productId } = data as { id: string };
  productIds.push(productId);
  const generated = await member.db.rpc("generate_sessions", { p_from: day, p_to: day, p_product_id: productId });
  if (generated.error) throw generated.error;
  const { data: session, error: sessionError } = await adminDb
    .from("sessions")
    .select("id")
    .eq("product_id", productId)
    .single();
  if (sessionError) throw sessionError;
  return session.id;
}

function book(sessionId: string, channel: "web" | "phone") {
  return (channel === "web" ? adminDb : member.db).rpc("create_booking_hold", {
    p_session_id: sessionId,
    p_lines: [{ ticket_type_id: ADULT_ID, qty: 2 }],
    p_customer: { name: "Lucía Pérez", email: `${randomUUID().slice(0, 8)}-${testTag}@example.test` },
    p_booking: channel === "web" ? { channel, payment: "on_site" } : { channel },
  });
}

async function bookOk(sessionId: string, channel: "web" | "phone"): Promise<string> {
  const { data, error } = await book(sessionId, channel);
  if (error) throw error;
  return (data as { id: string }).id;
}

async function teamFree(sessionId: string): Promise<boolean | null> {
  const { data, error } = await adminDb.from("session_team_status").select("team_free").eq("session_id", sessionId).single();
  if (error) throw error;
  return data.team_free;
}

const assignedTo = async (sessionId: string) => {
  const { data } = await adminDb.from("session_resources").select("resource_id").eq("session_id", sessionId);
  return (data ?? []).map((row) => row.resource_id);
};

describe("salidas con el único guía ocupado", () => {
  it("la primera reserva se queda con el guía y la web deja de vender las salidas que se solapan", async () => {
    const hiking = await createSession(DAYS[0], "09:00");
    const volcanoes = await createSession(DAYS[0], "10:00");
    const afternoon = await createSession(DAYS[0], "12:00");
    expect(await teamFree(hiking)).toBe(true);
    expect(await teamFree(volcanoes)).toBe(true);

    await bookOk(hiking, "web");
    expect(await assignedTo(hiking)).toEqual([LUKAS]);
    // 09:00–12:00 ocupa a Lukas: la de las 10:00 no se vende; la de las 12:00, ya libre, sí.
    expect(await teamFree(hiking)).toBe(true);
    expect(await teamFree(volcanoes)).toBe(false);
    expect(await teamFree(afternoon)).toBe(true);
    const blocked = await book(volcanoes, "web");
    expect(blocked.error?.code).toBe("RB002");
    await bookOk(hiking, "web");
    await bookOk(afternoon, "web");
    expect(await assignedTo(afternoon)).toEqual([LUKAS]);

    // El panel sí puede reservar: la salida queda sin guía (aparece en avisos).
    await bookOk(volcanoes, "phone");
    expect(await assignedTo(volcanoes)).toEqual([]);
    const { data: missing } = await member.db.rpc("session_missing_resources", { p_session_id: volcanoes });
    expect(missing).toBe(1);
    // Ya tiene reservas: la web sigue vendiéndola (el aviso ya existe y el equipo decide).
    expect(await teamFree(volcanoes)).toBe(true);
  });

  it("al cancelar la última reserva, el guía se libera y la otra salida vuelve a venderse", async () => {
    const first = await createSession(DAYS[1], "14:00");
    const second = await createSession(DAYS[1], "15:00");
    const a = await bookOk(first, "web");
    const b = await bookOk(first, "phone");
    expect(await teamFree(second)).toBe(false);

    expect((await member.db.rpc("booking_cancel", { p_booking_id: a })).error).toBeNull();
    expect(await assignedTo(first)).toEqual([LUKAS]);
    expect(await teamFree(second)).toBe(false);

    expect((await member.db.rpc("booking_cancel", { p_booking_id: b })).error).toBeNull();
    expect(await assignedTo(first)).toEqual([]);
    expect(await teamFree(second)).toBe(true);
    await bookOk(second, "web");
    expect(await assignedTo(second)).toEqual([LUKAS]);
  });

  it("al mover la única reserva a una salida que se solapa, el guía la acompaña", async () => {
    const from = await createSession(DAYS[2], "18:00");
    const to = await createSession(DAYS[2], "19:00");
    const id = await bookOk(from, "phone");
    expect((await member.db.rpc("booking_move", { p_booking_id: id, p_session_id: to })).error).toBeNull();
    expect(await assignedTo(from)).toEqual([]);
    expect(await assignedTo(to)).toEqual([LUKAS]);
  });

  it("si llegan a la vez reservas web a dos salidas que se solapan, solo una se acepta", async () => {
    const first = await createSession(DAYS[3], "02:00");
    const second = await createSession(DAYS[3], "03:00");
    const results = await Promise.all([book(first, "web"), book(second, "web")]);
    const codes = results.map((result) => result.error?.code ?? "ok").sort();
    expect(codes).toEqual(["RB002", "ok"]);
  });
});
