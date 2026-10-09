import { describe, expect, it } from "vitest";

import { formatCents, formatWholeEuros } from "@/lib/domain/money";

// Intl usa espacio duro (U+00A0) antes del símbolo y como separador de miles.
const nbsp = " ";

describe("formatCents", () => {
  it("muestra dos decimales cuando hay céntimos", () => {
    expect(formatCents(1250)).toBe(`12,50${nbsp}€`);
    expect(formatCents(4505)).toBe(`45,05${nbsp}€`);
  });

  it("omite los decimales en euros enteros, como el prototipo", () => {
    expect(formatCents(4500)).toBe(`45${nbsp}€`);
    expect(formatCents(0)).toBe(`0${nbsp}€`);
  });

  it("agrupa miles a partir de cinco cifras (norma es-ES)", () => {
    expect(formatCents(1234567)).toBe(`12.345,67${nbsp}€`);
    expect(formatCents(123456)).toBe(`1234,56${nbsp}€`);
  });

  it("formatea importes negativos (reembolsos)", () => {
    expect(formatCents(-500)).toBe(`-5${nbsp}€`);
  });

  it("no muestra signo con cero negativo", () => {
    expect(formatCents(-0)).toBe(`0${nbsp}€`);
  });

  it("rechaza importes que no son enteros", () => {
    expect(() => formatCents(12.5)).toThrow(RangeError);
    expect(() => formatCents(Number.NaN)).toThrow(RangeError);
  });
});

describe("formatWholeEuros", () => {
  it("redondea a euros sin decimales", () => {
    expect(formatWholeEuros(14950)).toBe(`150${nbsp}€`);
    expect(formatWholeEuros(4549)).toBe(`45${nbsp}€`);
    expect(formatWholeEuros(4500)).toBe(`45${nbsp}€`);
    expect(() => formatWholeEuros(1.5)).toThrow(RangeError);
  });
});
