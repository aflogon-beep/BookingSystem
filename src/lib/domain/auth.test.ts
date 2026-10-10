import { describe, expect, it } from "vitest";

import { PASSWORD_MIN_LENGTH, canAccess, safeNextPath, validateNewPassword } from "@/lib/domain/auth";

describe("validateNewPassword", () => {
  it("acepta una contraseña que cumple la política y coincide con la confirmación", () => {
    expect(validateNewPassword("Teide2026abc", "Teide2026abc")).toEqual({ ok: true });
  });

  it(`exige al menos ${PASSWORD_MIN_LENGTH} caracteres`, () => {
    expect(validateNewPassword("Teide20a", "Teide20a")).toEqual({ ok: false, errors: ["too_short"] });
  });

  it("exige minúsculas, mayúsculas y dígitos", () => {
    expect(validateNewPassword("teide2026abc", "teide2026abc")).toEqual({ ok: false, errors: ["missing_uppercase"] });
    expect(validateNewPassword("TEIDE2026ABC", "TEIDE2026ABC")).toEqual({ ok: false, errors: ["missing_lowercase"] });
    expect(validateNewPassword("TeideTeideAbc", "TeideTeideAbc")).toEqual({ ok: false, errors: ["missing_digit"] });
  });

  it("rechaza la contraseña si la confirmación no coincide", () => {
    expect(validateNewPassword("Teide2026abc", "Teide2026abd")).toEqual({ ok: false, errors: ["mismatch"] });
  });

  it("devuelve todos los errores a la vez", () => {
    expect(validateNewPassword("abc", "abd")).toEqual({
      ok: false,
      errors: ["too_short", "missing_uppercase", "missing_digit", "mismatch"],
    });
  });
});

describe("safeNextPath", () => {
  it("acepta rutas internas del panel con query", () => {
    expect(safeNextPath("/panel/reservas?tab=hoy")).toBe("/panel/reservas?tab=hoy");
  });

  it("vuelve al panel si no hay destino", () => {
    expect(safeNextPath(null)).toBe("/panel");
    expect(safeNextPath(undefined)).toBe("/panel");
    expect(safeNextPath("")).toBe("/panel");
  });

  it("rechaza destinos fuera de la app (open redirect)", () => {
    expect(safeNextPath("https://malo.example")).toBe("/panel");
    expect(safeNextPath("//malo.example/panel")).toBe("/panel");
    expect(safeNextPath("/\\malo.example")).toBe("/panel");
    expect(safeNextPath("javascript:alert(1)")).toBe("/panel");
  });

  it("solo admite destinos dentro del panel", () => {
    expect(safeNextPath("/login")).toBe("/panel");
    expect(safeNextPath("/panelx")).toBe("/panel");
    expect(safeNextPath("/panel")).toBe("/panel");
  });
});

describe("canAccess", () => {
  it("el admin accede a todo", () => {
    expect(canAccess("admin", "ajustes")).toBe(true);
    expect(canAccess("admin", "hoy")).toBe(true);
  });

  it("el staff opera pero no entra en ajustes ni en informes", () => {
    expect(canAccess("staff", "hoy")).toBe(true);
    expect(canAccess("staff", "reservas")).toBe(true);
    expect(canAccess("staff", "ajustes")).toBe(false);
    expect(canAccess("staff", "informes")).toBe(false);
  });
});
