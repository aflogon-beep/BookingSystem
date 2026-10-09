import { describe, expect, it } from "vitest";

import {
  bookingChangeError,
  isEditable,
  isFreeCancellation,
  moveOptionLabel,
  moveOptions,
  paymentLabel,
  seatsOf,
  type MoveCandidate,
} from "./booking-detail";

const now = new Date("2026-10-14T10:00:00Z");

const session = (id: string, startsAt: string, extra: Partial<MoveCandidate> = {}): MoveCandidate => ({
  id,
  startsAt,
  language: "es",
  status: "open",
  free: 5,
  ...extra,
});

describe("seatsOf", () => {
  it("cuenta solo las entradas que ocupan plaza", () => {
    expect(
      seatsOf([
        { qty: 2, takesSeat: true },
        { qty: 1, takesSeat: false },
      ]),
    ).toBe(2);
  });
});

describe("moveOptions", () => {
  it("deja las salidas abiertas, futuras, de los próximos 30 días y con plazas, en orden", () => {
    const options = moveOptions(
      [
        session("later", "2026-10-20T15:30:00Z"),
        session("current", "2026-10-16T15:30:00Z"),
        session("soon", "2026-10-15T15:30:00Z"),
        session("past", "2026-10-14T09:00:00Z"),
        session("closed", "2026-10-17T15:30:00Z", { status: "closed" }),
        session("full", "2026-10-18T15:30:00Z", { free: 2 }),
        session("far", "2026-11-20T15:30:00Z"),
      ],
      "current",
      3,
      now,
    );
    expect(options.map((option) => option.id)).toEqual(["soon", "later"]);
  });

  it("como mucho 40 opciones", () => {
    const many = Array.from({ length: 60 }, (_, i) => session(`s${i}`, new Date(now.getTime() + (i + 1) * 3_600_000).toISOString()));
    expect(moveOptions(many, "x", 1, now)).toHaveLength(40);
  });
});

describe("moveOptionLabel", () => {
  it("fecha y hora de Canarias, idioma y plazas", () => {
    expect(moveOptionLabel(session("a", "2026-10-15T15:30:00Z"))).toBe("jue 15 oct · 16:30 · ES · 5 libres");
    expect(moveOptionLabel(session("a", "2026-10-15T15:30:00Z", { free: 1, language: "en" }))).toMatch(/· EN · 1 libre$/);
  });
});

describe("isFreeCancellation", () => {
  it("es gratis hasta las horas de Ajustes antes de la salida", () => {
    expect(isFreeCancellation("2026-10-15T10:00:00Z", now, 24)).toBe(true);
    expect(isFreeCancellation("2026-10-15T09:59:00Z", now, 24)).toBe(false);
    expect(isFreeCancellation("2026-10-14T10:01:00Z", now, 0)).toBe(true);
  });
});

describe("isEditable", () => {
  it("solo confirmadas cuya salida no ha empezado", () => {
    expect(isEditable("confirmed", "2026-10-14T10:01:00Z", now)).toBe(true);
    expect(isEditable("confirmed", "2026-10-14T10:00:00Z", now)).toBe(false);
    expect(isEditable("cancelled", "2026-10-20T10:00:00Z", now)).toBe(false);
  });
});

describe("paymentLabel", () => {
  const base = { paymentMethod: null, paidCents: 0, agent: "" };
  it("describe cada estado de pago", () => {
    expect(paymentLabel({ ...base, paymentStatus: "paid", paymentMethod: "cash", paidCents: 13800 })).toMatch(/^138\s€ · Efectivo$/);
    expect(paymentLabel({ ...base, paymentStatus: "refunded", paidCents: 4500 })).toMatch(/^Reembolsado 45\s€$/);
    expect(paymentLabel({ ...base, paymentStatus: "invoice", agent: "Viajes Sol" })).toBe("Se factura a Viajes Sol");
    expect(paymentLabel({ ...base, paymentStatus: "invoice" })).toBe("Se factura a la agencia");
    expect(paymentLabel({ ...base, paymentStatus: "pending", paymentMethod: "payment_link" })).toBe("Enlace enviado, sin pagar");
    expect(paymentLabel({ ...base, paymentStatus: "pending" })).toBe("Pendiente");
  });
});

describe("bookingChangeError", () => {
  it("explica los errores de la BD", () => {
    expect(bookingChangeError("RB001", "1")).toBe("Esa salida ya solo tiene 1 plaza libre. Elige otra.");
    expect(bookingChangeError("RB001", "x")).toBe("Esa salida ya no tiene plazas suficientes. Elige otra.");
    expect(bookingChangeError("RB009", undefined)).toBe("La reserva ya está cancelada.");
    expect(bookingChangeError("RB007", undefined)).toMatch(/ya ha empezado/);
    expect(bookingChangeError(undefined, undefined)).toBe("No se pudo guardar. Inténtalo de nuevo.");
  });
});
