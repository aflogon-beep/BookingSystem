import { describe, expect, it } from "vitest";

import {
  addRecentBooking,
  cartLabel,
  hasRecentBooking,
  resolveCart,
  webBookingErrorMessage,
  webCustomerSchema,
} from "./web-checkout";

const ADULT = { id: "a", name: "Adulto", takesSeat: true, priceCents: 6900 };
const CHILD = { id: "c", name: "Niño", takesSeat: true, priceCents: 4500 };
const BABY = { id: "b", name: "Bebé", takesSeat: false, priceCents: 0 };
const TICKETS = [ADULT, CHILD, BABY];

describe("resolveCart", () => {
  it("calcula plazas y total con los precios del producto", () => {
    const cart = resolveCart(TICKETS, [{ ticketTypeId: "a", qty: 2 }, { ticketTypeId: "c", qty: 1 }, { ticketTypeId: "b", qty: 1 }], 3);
    expect(cart).toMatchObject({ ok: true, seats: 3, totalCents: 18300 });
    if (cart.ok) expect(cartLabel(cart.lines)).toBe("2 Adulto · 1 Niño · 1 Bebé");
  });

  it("rechaza entradas que no se venden, sin plaza o de más", () => {
    expect(resolveCart(TICKETS, [{ ticketTypeId: "x", qty: 1 }], 5)).toMatchObject({ ok: false });
    expect(resolveCart(TICKETS, [{ ticketTypeId: "b", qty: 1 }], 5)).toEqual({ ok: false, error: "Añade al menos una entrada con plaza." });
    expect(resolveCart(TICKETS, [{ ticketTypeId: "a", qty: 2 }], 1)).toEqual({ ok: false, error: "Solo queda 1 plaza en esta salida." });
    expect(resolveCart(TICKETS, [{ ticketTypeId: "a", qty: 4 }], 3)).toEqual({ ok: false, error: "Solo quedan 3 plazas en esta salida." });
  });
});

describe("webCustomerSchema", () => {
  it("normaliza y acepta lo opcional vacío", () => {
    expect(webCustomerSchema.parse({ name: "  Lucía Pérez ", email: "LUCIA@Example.com " })).toEqual({
      name: "Lucía Pérez",
      email: "lucia@example.com",
      phone: "",
      hotel: "",
      website: "",
    });
  });

  it("exige nombre y email válidos y deja fuera a los bots", () => {
    expect(webCustomerSchema.safeParse({ name: "", email: "a@b.es" }).success).toBe(false);
    expect(webCustomerSchema.safeParse({ name: "Ana", email: "no-es-email" }).success).toBe(false);
    expect(webCustomerSchema.safeParse({ name: "Ana", email: "a@b.es", phone: "abc" }).success).toBe(false);
    expect(webCustomerSchema.safeParse({ name: "Ana", email: "a@b.es", website: "http://spam" }).success).toBe(false);
  });
});

describe("webBookingErrorMessage", () => {
  it("explica al cliente cada error", () => {
    expect(webBookingErrorMessage("RB001", "0")).toMatch(/se acaba de completar/);
    expect(webBookingErrorMessage("RB001", "2")).toMatch(/quedan 2 plazas/);
    expect(webBookingErrorMessage("RB001", undefined)).toMatch(/No quedan plazas/);
    expect(webBookingErrorMessage("RB002", undefined)).toMatch(/ya no admite reservas/);
    expect(webBookingErrorMessage("RB003", undefined)).toMatch(/entradas/);
    expect(webBookingErrorMessage("XX000", undefined)).toMatch(/Inténtalo de nuevo/);
  });
});

describe("cookie de reservas recientes", () => {
  const A = "00000000-0000-4000-8000-0000000000aa";
  const B = "00000000-0000-4000-8000-0000000000bb";

  it("guarda las 5 últimas sin repetir y descarta basura", () => {
    expect(addRecentBooking(undefined, A)).toBe(A);
    expect(addRecentBooking(`${A},basura`, B)).toBe(`${B},${A}`);
    expect(addRecentBooking(`${B},${A}`, A)).toBe(`${A},${B}`);
    const many = Array.from({ length: 6 }, (_, index) => `00000000-0000-4000-8000-00000000000${index}`);
    expect(addRecentBooking(many.join(","), A).split(",")).toHaveLength(5);
  });

  it("hasRecentBooking", () => {
    expect(hasRecentBooking(`${A},${B}`, B)).toBe(true);
    expect(hasRecentBooking(undefined, A)).toBe(false);
  });
});
