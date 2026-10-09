import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adminDb, anonDb, createTestUser, deleteTestUsers, type Db, type TestUser } from "./helpers";

// Ids fijos del seed (supabase/seed.sql).
const ADULT_ID = "00000000-0000-4000-8000-000000000101";
const CHILD_ID = "00000000-0000-4000-8000-000000000102";
const BABY_ID = "00000000-0000-4000-8000-000000000103";

// Fechas lejanas para no cruzarse con el seed ni con los e2e.
const DAY = "2031-03-12";
const PRODUCT_NAME = "Tour de reservas (test)";

let member: TestUser;
let outsider: TestUser;
const productIds: string[] = [];
const ticketTypeIds: string[] = [];
const testTag = randomUUID().slice(0, 8);

/** Borra lo que haya dejado una ejecución anterior interrumpida (los e2e usan la misma BD). */
async function removeTestProducts(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { data: sessions } = await adminDb.from("sessions").select("id").in("product_id", ids);
  const sessionIdsToClean = sessions?.map((session) => session.id) ?? [];
  if (sessionIdsToClean.length) await adminDb.from("bookings").delete().in("session_id", sessionIdsToClean);
  await adminDb.from("products").delete().in("id", ids);
}

beforeAll(async () => {
  const { data: leftovers } = await adminDb.from("products").select("id").eq("name", PRODUCT_NAME);
  await removeTestProducts(leftovers?.map((product) => product.id) ?? []);
  member = await createTestUser({ name: "Carla Staff", role: "staff" });
  outsider = await createTestUser();
});

afterAll(async () => {
  await removeTestProducts(productIds);
  await adminDb.from("customers").delete().like("email", `%-${testTag}@example.test`);
  if (ticketTypeIds.length) await adminDb.from("ticket_types").delete().in("id", ticketTypeIds);
  await deleteTestUsers([outsider, member]);
});

/** Producto de prueba con una salida diaria a las 10:00 y precios adulto 50 €, niño 20 €, bebé 0 €. */
async function createSession(capacity = 10): Promise<{ productId: string; sessionId: string }> {
  const { data, error } = await member.db.rpc("save_product", {
    p_product: {
      slug: `reservas-${randomUUID()}`,
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
  const { data: session, error: sessionError } = await adminDb
    .from("sessions")
    .select("id")
    .eq("product_id", productId)
    .single();
  if (sessionError) throw sessionError;
  return { productId, sessionId: session.id };
}

type Line = { ticket_type_id: string; qty: number };
const adults = (qty: number): Line[] => [{ ticket_type_id: ADULT_ID, qty }];
const customer = (name = "Lucía Pérez") => ({ name, email: `${randomUUID().slice(0, 8)}-${testTag}@example.test` });

function book(
  sessionId: string,
  lines: Line[],
  booking: Record<string, string> = { channel: "phone" },
  db: Db = member.db,
  person: Record<string, string> = customer(),
) {
  return db.rpc("create_booking_hold", { p_session_id: sessionId, p_lines: lines, p_customer: person, p_booking: booking });
}

type Created = { id: string; code: string; status: string; payment_status: string; total_cents: number; hold_expires_at: string | null };

async function bookOk(...args: Parameters<typeof book>): Promise<Created> {
  const { data, error } = await book(...args);
  if (error) throw error;
  return data as Created;
}

async function seatsOf(sessionId: string) {
  const { data, error } = await adminDb
    .from("session_availability")
    .select("booked_seats, free_seats, pax")
    .eq("session_id", sessionId)
    .single();
  if (error) throw error;
  return data;
}

describe("create_booking_hold", () => {
  it("el panel crea una reserva confirmada con precios de la BD y su historial", async () => {
    const { sessionId } = await createSession();
    const created = await bookOk(
      sessionId,
      [
        { ticket_type_id: ADULT_ID, qty: 2 },
        { ticket_type_id: CHILD_ID, qty: 1 },
        { ticket_type_id: BABY_ID, qty: 1 },
      ],
      { channel: "desk", payment_method: "cash", hotel: "Hotel Mencey", notes: "Vegetariano" },
    );
    expect(created).toMatchObject({ status: "confirmed", payment_status: "paid", total_cents: 12000, hold_expires_at: null });
    expect(created.code).toMatch(/^VT[0-9A-Z]{6}$/);

    const { data: booking } = await adminDb
      .from("bookings")
      .select("channel, payment_method, paid_cents, hotel, notes, booking_lines(ticket_type_id, qty, unit_price_cents, takes_seat), booking_events(actor, text)")
      .eq("id", created.id)
      .single();
    expect(booking).toMatchObject({ channel: "desk", payment_method: "cash", paid_cents: 12000, hotel: "Hotel Mencey", notes: "Vegetariano" });
    expect(booking?.booking_lines).toHaveLength(3);
    expect(booking?.booking_lines).toContainEqual({ ticket_type_id: BABY_ID, qty: 1, unit_price_cents: 0, takes_seat: false });
    expect(booking?.booking_events).toEqual([{ actor: "Carla Staff", text: "Reserva creada" }]);
    // El bebé es pasajero pero no ocupa plaza.
    expect(await seatsOf(sessionId)).toEqual({ booked_seats: 3, free_seats: 7, pax: 4 });
  });

  it("el estado de pago sale del método, no del cliente", async () => {
    const { sessionId } = await createSession();
    const invoice = await bookOk(sessionId, adults(1), { channel: "agency", payment_method: "invoice", payment_status: "paid" });
    expect(invoice.payment_status).toBe("invoice");
    const link = await bookOk(sessionId, adults(1), { channel: "phone", payment_method: "payment_link" });
    expect(link.payment_status).toBe("pending");
    const bad = await book(sessionId, adults(1), { channel: "phone", payment_method: "card_online" });
    expect(bad.error?.code).toBe("22023");
  });

  it("la web (service role) bloquea las plazas 35 minutos y la plaza se libera al caducar", async () => {
    const { sessionId } = await createSession(4);
    const hold = await bookOk(sessionId, adults(3), { channel: "web" }, adminDb);
    expect(hold).toMatchObject({ status: "pending", payment_status: "pending", total_cents: 15000 });
    const { data: row } = await adminDb.from("bookings").select("created_at").eq("id", hold.id).single();
    const minutes = (new Date(hold.hold_expires_at ?? 0).getTime() - new Date(row?.created_at ?? 0).getTime()) / 60_000;
    expect(minutes).toBeCloseTo(35, 3);
    expect((await book(sessionId, adults(2))).error?.code).toBe("RB001");

    await adminDb.from("bookings").update({ hold_expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", hold.id);
    expect((await seatsOf(sessionId)).booked_seats).toBe(0);
    await bookOk(sessionId, adults(4));
  });

  it("la última plaza se vende y una más no, con las plazas libres en el aviso", async () => {
    const { sessionId } = await createSession(3);
    await bookOk(sessionId, adults(2));
    const tooMany = await book(sessionId, adults(2));
    expect(tooMany.error?.code).toBe("RB001");
    expect(tooMany.error?.hint).toBe("1");
    await bookOk(sessionId, [{ ticket_type_id: ADULT_ID, qty: 1 }, { ticket_type_id: BABY_ID, qty: 2 }]);
    expect(await seatsOf(sessionId)).toEqual({ booked_seats: 3, free_seats: 0, pax: 5 });
  });

  it("no pasa del aforo con muchas reservas a la vez", async () => {
    const { sessionId } = await createSession(5);
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, index) => book(sessionId, adults(1), { channel: "phone" }, index % 2 ? member.db : adminDb)),
    );
    expect(results.filter((result) => !result.error)).toHaveLength(5);
    expect(results.filter((result) => result.error?.code === "RB001")).toHaveLength(7);
    expect(await seatsOf(sessionId)).toMatchObject({ booked_seats: 5, free_seats: 0 });
  });

  it("rechaza entradas no válidas", async () => {
    const { sessionId } = await createSession();
    const cases: Line[][] = [
      [],
      [{ ticket_type_id: ADULT_ID, qty: 0 }],
      [{ ticket_type_id: ADULT_ID, qty: 101 }],
      [{ ticket_type_id: ADULT_ID, qty: 1 }, { ticket_type_id: ADULT_ID, qty: 1 }],
      // Residente canario: existe pero este producto no lo vende.
      [{ ticket_type_id: "00000000-0000-4000-8000-000000000104", qty: 1 }],
      // Solo bebés: nadie ocupa plaza.
      [{ ticket_type_id: BABY_ID, qty: 1 }],
    ];
    for (const lines of cases) expect((await book(sessionId, lines)).error?.code, JSON.stringify(lines)).toBe("RB003");
    expect((await book(sessionId, adults(1), { channel: "fax" })).error?.code).toBe("22023");
    expect((await book(sessionId, adults(1), { channel: "phone" }, member.db, { name: " " })).error?.code).toBe("22023");
    expect((await seatsOf(sessionId)).booked_seats).toBe(0);
  });

  it("no reserva salidas cerradas, canceladas o inexistentes", async () => {
    const { sessionId } = await createSession();
    await adminDb.from("sessions").update({ status: "closed" }).eq("id", sessionId);
    expect((await book(sessionId, adults(1))).error?.code).toBe("RB002");
    await adminDb.from("sessions").update({ status: "cancelled" }).eq("id", sessionId);
    expect((await book(sessionId, adults(1))).error?.code).toBe("RB002");
    expect((await book(randomUUID(), adults(1))).error?.code).toBe("P0002");
  });

  it("la web no vende productos desactivados; el panel sí", async () => {
    const { productId, sessionId } = await createSession();
    await adminDb.from("products").update({ active: false }).eq("id", productId);
    expect((await book(sessionId, adults(1), { channel: "web" }, adminDb)).error?.code).toBe("RB002");
    await bookOk(sessionId, adults(1));
  });

  it("reutiliza el cliente si repite email y nombre; con otro nombre crea otro", async () => {
    const { sessionId } = await createSession();
    const person = customer("Marta Ruiz");
    const first = await bookOk(sessionId, adults(1), { channel: "phone" }, member.db, person);
    const same = await bookOk(sessionId, adults(1), { channel: "phone" }, member.db, {
      name: "marta ruiz",
      email: person.email.toUpperCase(),
    });
    const other = await bookOk(sessionId, adults(1), { channel: "agency", agent: "Viajes Teide" }, member.db, {
      ...person,
      name: "Jon Smith",
    });
    const { data } = await adminDb.from("bookings").select("id, agent, customers(name)").in("id", [first.id, same.id, other.id]);
    const nameOf = (id: string) => data?.find((row) => row.id === id)?.customers.name;
    expect([nameOf(first.id), nameOf(same.id), nameOf(other.id)]).toEqual(["Marta Ruiz", "Marta Ruiz", "Jon Smith"]);
    expect(data?.find((row) => row.id === other.id)?.agent).toBe("Viajes Teide");
  });

  it("la web respeta el cierre de venta y nadie reserva una salida ya empezada", async () => {
    const { sessionId } = await createSession();
    // Ajustes del seed: cierre de venta 2 horas antes.
    const soon = new Date(Date.now() + 60 * 60_000).toISOString();
    await adminDb.from("sessions").update({ starts_at: soon, ends_at: new Date(Date.now() + 2 * 60 * 60_000).toISOString() }).eq("id", sessionId);
    expect((await book(sessionId, adults(1), { channel: "web" }, adminDb)).error?.code).toBe("RB002");
    await bookOk(sessionId, adults(1), { channel: "phone" });

    const { sessionId: started } = await createSession();
    const past = new Date(Date.now() - 60_000).toISOString();
    await adminDb.from("sessions").update({ starts_at: past }).eq("id", started);
    expect((await book(started, adults(1))).error?.code).toBe("RB002");
  });

  it("líneas mal formadas dan RB003, no un error genérico", async () => {
    const { sessionId } = await createSession();
    const bad = [
      [{ ticket_type_id: ADULT_ID, qty: 1 }, { ticket_type_id: CHILD_ID, qty: null }],
      [{ ticket_type_id: "no-es-un-uuid", qty: 1 }],
      [{ ticket_type_id: ADULT_ID, qty: "dos" }],
    ];
    for (const lines of bad) {
      const { error } = await member.db.rpc("create_booking_hold", {
        p_session_id: sessionId,
        p_lines: lines,
        p_customer: customer(),
        p_booking: { channel: "phone" },
      });
      expect(error?.code, JSON.stringify(lines)).toBe("RB003");
    }
  });
});

describe("salidas y productos con reservas", () => {
  it("generate_sessions no cambia una salida con plazas ocupadas", async () => {
    const { productId, sessionId } = await createSession();
    await bookOk(sessionId, adults(1));
    await member.db.from("products").update({ capacity: 30 }).eq("id", productId);
    const { error } = await member.db.rpc("generate_sessions", { p_from: DAY, p_to: DAY, p_product_id: productId });
    expect(error).toBeNull();
    const { data } = await adminDb.from("sessions").select("id, capacity, status").eq("product_id", productId);
    expect(data).toEqual([{ id: sessionId, capacity: 10, status: "open" }]);
  });

  it("si la regla desaparece, una salida con reservas se cierra en lugar de borrarse", async () => {
    const { productId, sessionId } = await createSession();
    // Un pago web abandonado: la reserva caduca, pero queda en el historial.
    const hold = await bookOk(sessionId, adults(1), { channel: "web" }, adminDb);
    await adminDb.from("bookings").update({ hold_expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", hold.id);
    await member.db.from("schedule_rules").delete().eq("product_id", productId);
    const { error } = await member.db.rpc("generate_sessions", { p_from: DAY, p_to: DAY, p_product_id: productId });
    expect(error).toBeNull();
    const { data } = await adminDb.from("sessions").select("id, status").eq("product_id", productId);
    expect(data).toEqual([{ id: sessionId, status: "closed" }]);
  });

  it("el aforo de una salida no baja de las plazas ocupadas", async () => {
    const { sessionId } = await createSession();
    await bookOk(sessionId, adults(4));
    const tooLow = await member.db.from("sessions").update({ capacity: 3, capacity_custom: true }).eq("id", sessionId);
    expect(tooLow.error?.code).toBe("RB001");
    const ok = await member.db.from("sessions").update({ capacity: 4, capacity_custom: true }).eq("id", sessionId);
    expect(ok.error).toBeNull();
  });

  it("no se puede borrar un producto ni un tipo de entrada con reservas", async () => {
    const { productId, sessionId } = await createSession();
    const { data: ticketType, error } = await adminDb
      .from("ticket_types")
      .insert({ name: `Prueba ${testTag}`, sort: 99 })
      .select("id")
      .single();
    if (error) throw error;
    ticketTypeIds.push(ticketType.id);
    await adminDb.from("product_prices").insert({ product_id: productId, ticket_type_id: ticketType.id, price_cents: 100 });
    await bookOk(sessionId, [{ ticket_type_id: ticketType.id, qty: 1 }]);

    expect((await member.db.from("products").delete().eq("id", productId)).error?.code).toBe("23503");
    expect((await adminDb.from("ticket_types").delete().eq("id", ticketType.id)).error?.code).toBe("23503");
  });
});

describe("RLS de reservas", () => {
  it("anon no lee reservas, clientes, líneas, historial ni disponibilidad, ni puede reservar", async () => {
    const anon = anonDb();
    for (const table of ["bookings", "customers", "booking_lines", "booking_events", "session_availability"] as const) {
      const { data, error } = await anon.from(table as "bookings").select("*").limit(1);
      expect(error?.code ?? (data?.length ? "visible" : null), table).toBe("42501");
    }
    const { sessionId } = await createSession();
    expect((await book(sessionId, adults(1), { channel: "web" }, anon)).error?.code).toBe("42501");
  });

  it("quien no es del equipo no ve nada ni puede reservar", async () => {
    const { sessionId } = await createSession();
    await bookOk(sessionId, adults(1));
    expect((await outsider.db.from("bookings").select("id")).data).toEqual([]);
    expect((await outsider.db.from("customers").select("id")).data).toEqual([]);
    expect((await outsider.db.from("session_availability").select("session_id")).data).toEqual([]);
    expect((await book(sessionId, adults(1), { channel: "phone" }, outsider.db)).error?.code).toBe("42501");
    // La web solo entra desde el servidor (service role), ni siquiera el equipo.
    expect((await book(sessionId, adults(1), { channel: "web" })).error?.code).toBe("42501");
  });

  it("el equipo no crea reservas, líneas ni historial a mano, ni cambia estado o importes", async () => {
    const { sessionId } = await createSession();
    const created = await bookOk(sessionId, adults(1), { channel: "phone" });
    const { data: line } = await adminDb.from("booking_lines").select("*").eq("booking_id", created.id).single();
    const { data: booking } = await adminDb
      .from("bookings")
      .select("session_id, customer_id, channel, total_cents")
      .eq("id", created.id)
      .single();
    if (!line || !booking) throw new Error("Sin reserva");
    const direct = await member.db.from("bookings").insert({ ...booking, code: "VT222222", status: "confirmed", total_cents: 0 });
    expect(direct.error?.code).toBe("42501");
    expect((await member.db.from("booking_lines").insert({ ...line, qty: 50 })).error?.code).toBe("42501");
    expect((await member.db.from("booking_events").insert({ booking_id: created.id, actor: "Otro", text: "x" })).error?.code).toBe("42501");
    expect((await member.db.from("bookings").update({ status: "cancelled" }).eq("id", created.id)).error?.code).toBe("42501");
    expect((await member.db.from("bookings").update({ paid_cents: 999 }).eq("id", created.id)).error?.code).toBe("42501");
    const notes = await member.db.from("bookings").update({ notes: "Alergia al gluten", checked_in: true }).eq("id", created.id);
    expect(notes.error).toBeNull();
  });

  it("el equipo no puede borrar reservas ni editar sus líneas", async () => {
    const { sessionId } = await createSession();
    const created = await bookOk(sessionId, adults(1));
    expect((await member.db.from("bookings").delete().eq("id", created.id)).error?.code).toBe("42501");
    expect((await member.db.from("booking_lines").update({ unit_price_cents: 1 }).eq("booking_id", created.id)).error?.code).toBe("42501");
  });
});
