import { describe, expect, it } from "vitest";

import {
  NOTHING_MISSING,
  attentionItems,
  canBookSession,
  dayKpis,
  dayLabel,
  missingText,
  parseDayParam,
  sessionFlags,
  shiftDay,
  timeAgo,
} from "./today";

const booking = (overrides: Partial<Parameters<typeof dayKpis>[1][number]> = {}) => ({
  sessionId: "s1",
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
    // Al teclear en un input de fecha salen años intermedios: no se aceptan.
    expect(parseDayParam("0002-10-14", "2026-10-09")).toBe("2026-10-09");
    expect(parseDayParam("0202-10-14", "2026-10-09")).toBe("2026-10-09");
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
        { id: "s1", status: "open" },
        { id: "s2", status: "open" },
        { id: "s3", status: "closed" },
        { id: "s4", status: "cancelled" },
      ],
      [
        booking({ pax: 3, checkedIn: true }),
        booking({ pax: 1, paymentStatus: "pending", totalCents: 1800 }),
        booking({ sessionId: "s3", paymentStatus: "invoice", totalCents: 4000 }),
        booking({ sessionId: "s2", status: "pending", paymentStatus: "pending", totalCents: 9999 }),
        booking({ sessionId: "s4", status: "cancelled", totalCents: 5000 }),
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
  const base = { status: "open", booked: 0, capacity: 16, minPax: 4, missing: NOTHING_MISSING };
  const noGuide = { ...NOTHING_MISSING, guide: 1 };

  it("marca sin equipo solo con reservas y antes que bajo mínimo", () => {
    expect(sessionFlags({ ...base, missing: noGuide })).toEqual([]);
    expect(sessionFlags({ ...base, booked: 2, missing: noGuide }).map((flag) => flag.label)).toEqual(["Sin equipo", "Bajo mínimo"]);
    expect(sessionFlags({ ...base, status: "cancelled", booked: 2, missing: noGuide }).map((flag) => flag.label)).toEqual(["Cancelada"]);
  });

  it("marca bajo mínimo solo con reservas", () => {
    expect(sessionFlags(base)).toEqual([]);
    expect(sessionFlags({ ...base, booked: 2 }).map((flag) => flag.label)).toEqual(["Bajo mínimo"]);
  });

  it("marca completa, cerrada y cancelada", () => {
    expect(sessionFlags({ ...base, booked: 16 }).map((flag) => flag.label)).toEqual(["Completa"]);
    expect(sessionFlags({ ...base, booked: 18 }).map((flag) => flag.label)).toEqual(["Completa"]);
    expect(sessionFlags({ ...base, status: "closed", booked: 1 }).map((flag) => flag.label)).toEqual(["Cerrada", "Bajo mínimo"]);
    expect(sessionFlags({ ...base, status: "cancelled", booked: 1 }).map((flag) => flag.label)).toEqual(["Cancelada"]);
  });
});

describe("reservar desde el panel", () => {
  const base = { status: "open", started: false, booked: 3, capacity: 16 };
  it("solo salidas abiertas, sin empezar y con plazas", () => {
    expect(canBookSession(base)).toBe(true);
    expect(canBookSession({ ...base, started: true })).toBe(false);
    expect(canBookSession({ ...base, booked: 16 })).toBe(false);
    expect(canBookSession({ ...base, status: "closed" })).toBe(false);
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
    missing: NOTHING_MISSING,
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
        // Ya salió aunque no haya terminado: no hay nada que hacer.
        session("f", { startsAt: "2026-10-09T09:59:00Z" }),
      ],
      now,
    );
    expect(items).toEqual([{ session: expect.objectContaining({ id: "a" }), kind: "min", text: "Faltan 2 para el mínimo (4)" }]);
  });

  it("avisa de las que no tienen el equipo que necesitan, aunque lleguen al mínimo", () => {
    const items = attentionItems(
      [
        session("a", { booked: 4, missing: { guide: 1, vehicle: 1, equipment: 0 } }),
        session("b", { missing: { guide: 0, vehicle: 0, equipment: 2 } }),
        session("c", { booked: 0, missing: { guide: 1, vehicle: 0, equipment: 0 } }),
      ],
      now,
    );
    expect(items.map((item) => [item.session.id, item.kind, item.text])).toEqual([
      ["a", "staff", "Sin guía/vehículo asignado"],
      ["b", "staff", "Sin equipo asignado"],
      ["b", "min", "Faltan 2 para el mínimo (4)"],
    ]);
  });

  it("texto de lo que falta", () => {
    expect(missingText({ guide: 2, vehicle: 0, equipment: 0 })).toBe("Sin guía asignado");
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
