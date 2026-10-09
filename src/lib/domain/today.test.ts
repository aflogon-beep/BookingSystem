import { describe, expect, it } from "vitest";

import { attentionItems, dayKpis, dayLabel, parseDayParam, sessionFlags, shiftDay, timeAgo } from "./today";

const booking = (overrides: Partial<Parameters<typeof dayKpis>[1][number]> = {}) => ({
  status: "confirmed",
  paymentStatus: "paid",
  totalCents: 6900,
  pax: 2,
  checkedIn: false,
  ...overrides,
});

describe("fecha del día", () => {
  it("lee ?fecha= válida y si no usa hoy", () => {
    expect(parseDayParam("2026-10-14", "2026-10-09")).toBe("2026-10-14");
    expect(parseDayParam(["2026-10-15", "x"], "2026-10-09")).toBe("2026-10-15");
    expect(parseDayParam("2026-02-30", "2026-10-09")).toBe("2026-10-09");
    expect(parseDayParam("mañana", "2026-10-09")).toBe("2026-10-09");
    expect(parseDayParam(undefined, "2026-10-09")).toBe("2026-10-09");
  });

  it("mueve días también al cruzar el cambio de hora", () => {
    expect(shiftDay("2026-10-25", 1)).toBe("2026-10-26");
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("etiqueta hoy, pasado o próximo", () => {
    expect(dayLabel("2026-10-09", "2026-10-09")).toBe("Hoy");
    expect(dayLabel("2026-10-08", "2026-10-09")).toBe("Día pasado");
    expect(dayLabel("2026-10-10", "2026-10-09")).toBe("Próximamente");
  });
});

describe("KPIs del día", () => {
  it("cuenta solo reservas confirmadas y salidas no canceladas", () => {
    const kpis = dayKpis(
      [
        { status: "open", booked: 4 },
        { status: "open", booked: 0 },
        { status: "closed", booked: 2 },
        { status: "cancelled", booked: 0 },
      ],
      [
        booking({ pax: 3, checkedIn: true }),
        booking({ pax: 1, paymentStatus: "pending", totalCents: 1800 }),
        booking({ paymentStatus: "invoice", totalCents: 4000 }),
        booking({ status: "pending", paymentStatus: "pending", totalCents: 9999 }),
        booking({ status: "cancelled", totalCents: 5000 }),
      ],
    );
    expect(kpis).toEqual({
      sessions: 3,
      sessionsWithBookings: 2,
      bookings: 3,
      pax: 6,
      checkedIn: 3,
      checkInPercent: 50,
      revenueCents: 12700,
      pendingPayments: 1,
    });
  });

  it("sin pasajeros el check-in es 0 %", () => {
    expect(dayKpis([], []).checkInPercent).toBe(0);
  });
});

describe("avisos de salida", () => {
  const base = { status: "open", booked: 0, capacity: 16, minPax: 4 };

  it("marca bajo mínimo solo con reservas", () => {
    expect(sessionFlags(base)).toEqual([]);
    expect(sessionFlags({ ...base, booked: 2 }).map((flag) => flag.label)).toEqual(["Bajo mínimo"]);
  });

  it("marca completa, cerrada y cancelada", () => {
    expect(sessionFlags({ ...base, booked: 16 }).map((flag) => flag.label)).toEqual(["Completa"]);
    expect(sessionFlags({ ...base, status: "closed", booked: 1 }).map((flag) => flag.label)).toEqual(["Cerrada", "Bajo mínimo"]);
    expect(sessionFlags({ ...base, status: "cancelled", booked: 1 }).map((flag) => flag.label)).toEqual(["Cancelada"]);
  });
});

describe("requiere atención", () => {
  const now = new Date("2026-10-09T10:00:00Z");
  const session = (id: string, overrides: object) => ({
    id,
    startsAt: "2026-10-09T16:30:00Z",
    status: "open",
    booked: 2,
    capacity: 16,
    minPax: 4,
    ...overrides,
  });

  it("avisa de las salidas futuras abiertas bajo el mínimo", () => {
    const items = attentionItems(
      [
        session("a", {}),
        session("b", { booked: 0 }),
        session("c", { booked: 4 }),
        session("d", { status: "closed" }),
        session("e", { startsAt: "2026-10-09T09:00:00Z" }),
      ],
      now,
    );
    expect(items).toEqual([{ session: expect.objectContaining({ id: "a" }), text: "Faltan 2 para el mínimo (4)" }]);
  });
});

describe("hace cuánto", () => {
  const now = new Date("2026-10-09T12:00:00Z");
  it("redondea como el prototipo", () => {
    expect(timeAgo("2026-10-09T11:59:50Z", now)).toBe("ahora");
    expect(timeAgo("2026-10-09T11:55:00Z", now)).toBe("hace 5 min");
    expect(timeAgo("2026-10-09T09:00:00Z", now)).toBe("hace 3 h");
    expect(timeAgo("2026-10-08T10:00:00Z", now)).toBe("ayer");
    expect(timeAgo("2026-10-05T12:00:00Z", now)).toBe("hace 4 días");
  });
});
