import { describe, expect, it } from "vitest";

import { productInputSchema, tabForIssue } from "./product";
import {
  countByResource,
  initials,
  needsFromRows,
  parseResourceField,
  productNeedsSchema,
  resourceTypeFromSlug,
  toggleGuideLanguage,
  weeklySessionsLabel,
} from "./resources";

describe("fichas del equipo", () => {
  it("la pestaña sale de ?tipo= y por defecto son los guías", () => {
    expect(resourceTypeFromSlug("vehiculos")).toBe("vehicle");
    expect(resourceTypeFromSlug("equipos")).toBe("equipment");
    expect(resourceTypeFromSlug(["guias"])).toBe("guide");
    expect(resourceTypeFromSlug("otra")).toBe("guide");
    expect(resourceTypeFromSlug(undefined)).toBe("guide");
  });

  it("valida nombre y asientos", () => {
    expect(parseResourceField("name", "  Ana Pérez ")).toEqual({ ok: true, value: "Ana Pérez" });
    expect(parseResourceField("name", "  ").ok).toBe(false);
    expect(parseResourceField("name", "x".repeat(121)).ok).toBe(false);
    expect(parseResourceField("seats", "16")).toEqual({ ok: true, value: 16 });
    expect(parseResourceField("seats", "")).toEqual({ ok: false, error: "Escribe un número." });
    expect(parseResourceField("seats", "0")).toEqual({ ok: false, error: "Mínimo 1." });
    expect(parseResourceField("seats", "101").ok).toBe(false);
    expect(parseResourceField("seats", "2.5").ok).toBe(false);
  });

  it("activa y desactiva idiomas de un guía en el orden de Ajustes", () => {
    expect(toggleGuideLanguage(["en"], "es")).toEqual(["es", "en"]);
    expect(toggleGuideLanguage(["es", "en"], "es")).toEqual(["en"]);
    expect(toggleGuideLanguage(["es"], "es")).toEqual([]);
    expect(toggleGuideLanguage(["xx", "de"], "en")).toEqual(["en", "de"]);
  });

  it("iniciales y salidas de la semana", () => {
    expect(initials("Ana Pérez")).toBe("AP");
    expect(initials("  javier  hernández gil ")).toBe("JH");
    expect(initials("Lukas")).toBe("L");
    expect(initials("")).toBe("");
    expect(weeklySessionsLabel(1)).toBe("1 salida esta semana");
    expect(weeklySessionsLabel(0)).toBe("0 salidas esta semana");
    expect(countByResource([{ resource_id: "a" }, { resource_id: "b" }, { resource_id: "a" }])).toEqual(
      new Map([
        ["a", 2],
        ["b", 1],
      ]),
    );
  });
});

describe("lo que necesita cada salida", () => {
  it("de 0 a 5 de cada tipo", () => {
    expect(productNeedsSchema.safeParse({ guide: 1, vehicle: 0, equipment: 5 }).success).toBe(true);
    expect(productNeedsSchema.safeParse({ guide: 6, vehicle: 0, equipment: 0 }).success).toBe(false);
    expect(productNeedsSchema.safeParse({ guide: -1, vehicle: 0, equipment: 0 }).success).toBe(false);
    expect(productNeedsSchema.safeParse({ guide: Number.NaN, vehicle: 0, equipment: 0 }).success).toBe(false);
  });

  it("las filas de la BD pasan a necesidades, con 0 en los tipos que faltan", () => {
    expect(needsFromRows([{ resource_type: "vehicle", qty: 2 }, { resource_type: "otro", qty: 1 }])).toEqual({
      guide: 0,
      vehicle: 2,
      equipment: 0,
    });
  });

  it("los errores de necesidades llevan a la pestaña Equipo", () => {
    expect(tabForIssue(["needs", "guide"])).toBe("equipo");
    const base = {
      name: "Teide",
      description: "",
      meetingPoint: "",
      place: "",
      durationMin: 60,
      capacity: 10,
      minPax: 1,
      pickup: false,
      color: "#0A84FF",
      photoPath: null,
      active: true,
      prices: [{ ticketTypeId: "00000000-0000-4000-8000-000000000101", priceCents: 100 }],
      rules: [],
    };
    expect(productInputSchema.parse(base).needs).toBeUndefined();
    expect(productInputSchema.parse({ ...base, needs: { guide: 1, vehicle: 1, equipment: 0 } }).needs).toEqual({
      guide: 1,
      vehicle: 1,
      equipment: 0,
    });
  });
});
