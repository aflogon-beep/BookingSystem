import { describe, expect, it } from "vitest";

import {
  durationLabel,
  formatPriceInput,
  minPrice,
  parsePriceInput,
  parseProductInput,
  photoExtension,
  slugify,
  uniqueSlug,
  type ProductInput,
} from "./product";

const ADULT = "00000000-0000-4000-8000-000000000101";
const CHILD = "00000000-0000-4000-8000-000000000102";
const context = { languages: ["es", "en"], ticketTypeIds: [ADULT, CHILD] };

const valid = (overrides: Partial<ProductInput> = {}): ProductInput => ({
  name: " Ruta de los volcanes ",
  description: "",
  meetingPoint: "Plaza",
  place: "",
  durationMin: 120,
  capacity: 12,
  minPax: 2,
  pickup: false,
  color: "#0A84FF",
  photoPath: null,
  active: true,
  prices: [{ ticketTypeId: ADULT, priceCents: 4500 }],
  rules: [{ weekdays: [3, 1, 1], times: ["17:30", "09:00"], language: "es", validFrom: null, validTo: null }],
  ...overrides,
});

describe("parseProductInput", () => {
  it("acepta un producto válido y normaliza nombre, días y horas", () => {
    const result = parseProductInput(valid(), context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe("Ruta de los volcanes");
    expect(result.value.rules[0]).toMatchObject({ weekdays: [1, 3], times: ["09:00", "17:30"] });
  });

  it("lleva cada error a su pestaña", () => {
    expect(parseProductInput(valid({ name: " " }), context)).toEqual({
      ok: false,
      error: "Ponle nombre al producto.",
      tab: "general",
    });
    expect(parseProductInput(valid({ prices: [] }), context)).toEqual({
      ok: false,
      error: "Activa al menos un tipo de entrada.",
      tab: "precios",
    });
    const noTimes = valid({ rules: [{ weekdays: [1], times: [], language: "es", validFrom: null, validTo: null }] });
    expect(parseProductInput(noTimes, context)).toMatchObject({ ok: false, tab: "horarios" });
  });

  it("no deja un mínimo mayor que el aforo", () => {
    expect(parseProductInput(valid({ capacity: 4, minPax: 5 }), context)).toMatchObject({
      ok: false,
      error: "El mínimo para salir no puede ser mayor que el aforo.",
      tab: "general",
    });
  });

  it("rechaza una temporada al revés", () => {
    const rules = [{ weekdays: [1], times: ["10:00"], language: "es", validFrom: "2026-11-01", validTo: "2026-10-01" }];
    expect(parseProductInput(valid({ rules }), context)).toMatchObject({ ok: false, tab: "horarios" });
  });

  it("rechaza idiomas que no están en Ajustes y tipos de entrada que no existen", () => {
    const rules = [{ weekdays: [1], times: ["10:00"], language: "de", validFrom: null, validTo: null }];
    expect(parseProductInput(valid({ rules }), context)).toMatchObject({ ok: false, tab: "horarios" });
    const prices = [{ ticketTypeId: "00000000-0000-4000-8000-000000000999", priceCents: 100 }];
    expect(parseProductInput(valid({ prices }), context)).toMatchObject({ ok: false, tab: "precios" });
  });

  it("no admite precios negativos ni con decimales", () => {
    expect(parseProductInput(valid({ prices: [{ ticketTypeId: ADULT, priceCents: -1 }] }), context).ok).toBe(false);
    expect(parseProductInput(valid({ prices: [{ ticketTypeId: ADULT, priceCents: 10.5 }] }), context).ok).toBe(false);
  });

  it("solo admite rutas de foto generadas por el panel", () => {
    expect(parseProductInput(valid({ photoPath: "0b6f1c1e-2f7a-4b8e-9c4d-1a2b3c4d5e6f.webp" }), context).ok).toBe(true);
    expect(parseProductInput(valid({ photoPath: "../otro-bucket/x.png" }), context).ok).toBe(false);
  });

  it("permite un producto sin reglas (no genera salidas)", () => {
    expect(parseProductInput(valid({ rules: [] }), context).ok).toBe(true);
  });
});

describe("parsePriceInput y formatPriceInput", () => {
  it("convierte euros escritos a céntimos sin coma flotante", () => {
    expect(parsePriceInput("45")).toBe(4500);
    expect(parsePriceInput("45,5")).toBe(4550);
    expect(parsePriceInput(" 45.05 ")).toBe(4505);
    expect(parsePriceInput("0")).toBe(0);
    expect(parsePriceInput("19,99")).toBe(1999);
  });

  it("rechaza lo que no es un importe", () => {
    expect(parsePriceInput("")).toBeNull();
    expect(parsePriceInput("-5")).toBeNull();
    expect(parsePriceInput("4,555")).toBeNull();
    expect(parsePriceInput("abc")).toBeNull();
  });

  it("vuelve a escribir los céntimos como en el prototipo", () => {
    expect(formatPriceInput(4500)).toBe("45");
    expect(formatPriceInput(4550)).toBe("45,50");
    expect(formatPriceInput(5)).toBe("0,05");
  });
});

describe("slugify y uniqueSlug", () => {
  it("quita acentos y símbolos", () => {
    expect(slugify("Teide al atardecer y estrellas")).toBe("teide-al-atardecer-y-estrellas");
    expect(slugify("  La Laguna, ciudad Patrimonio!  ")).toBe("la-laguna-ciudad-patrimonio");
    expect(slugify("Señales de Añaza")).toBe("senales-de-anaza");
    expect(slugify("¡¡!!")).toBe("tour");
  });

  it("añade un sufijo si el slug ya existe", () => {
    expect(uniqueSlug("teide", new Set())).toBe("teide");
    expect(uniqueSlug("teide", new Set(["teide", "teide-2"]))).toBe("teide-3");
  });
});

describe("durationLabel y minPrice", () => {
  it("formatea la duración como el prototipo", () => {
    expect(durationLabel(45)).toBe("45 min");
    expect(durationLabel(300)).toBe("5 h");
    expect(durationLabel(270)).toBe("4 h 30 min");
  });

  it("el precio «desde» ignora las entradas gratis", () => {
    expect(minPrice([{ priceCents: 0 }, { priceCents: 4500 }, { priceCents: 6900 }])).toBe(4500);
    expect(minPrice([{ priceCents: 0 }])).toBe(0);
    expect(minPrice([])).toBe(0);
  });
});

describe("photoExtension", () => {
  it("solo admite JPG, PNG y WebP", () => {
    expect(photoExtension("image/webp")).toBe("webp");
    expect(photoExtension("image/gif")).toBeNull();
    expect(photoExtension("constructor")).toBeNull();
  });
});
