import { describe, expect, it } from "vitest";

import { formatCents } from "@/lib/domain/money";

// Intl usa espacio duro (U+00A0) antes del símbolo y como separador de miles.
const nbsp = " ";

describe("formatCents", () => {
  it("formatea céntimos como euros en es-ES", () => {
    expect(formatCents(1250)).toBe(`12,50${nbsp}€`);
  });

  it("formatea cero", () => {
    expect(formatCents(0)).toBe(`0,00${nbsp}€`);
  });

  it("agrupa miles", () => {
    expect(formatCents(1234567)).toBe(`12.345,67${nbsp}€`);
  });

  it("formatea importes negativos (reembolsos)", () => {
    expect(formatCents(-500)).toBe(`-5,00${nbsp}€`);
  });

  it("rechaza importes que no son enteros", () => {
    expect(() => formatCents(12.5)).toThrow(RangeError);
    expect(() => formatCents(Number.NaN)).toThrow(RangeError);
  });
});
