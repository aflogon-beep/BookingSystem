import { describe, expect, it } from "vitest";

import {
  isLanguageCode,
  isSettingsField,
  nextTicketTypeSort,
  parseSettingsField,
  parseTicketTypeField,
  productsLeftWithoutPrices,
  toggleLanguage,
} from "./settings";

describe("parseSettingsField", () => {
  it("recorta el nombre comercial y no lo deja vacío", () => {
    expect(parseSettingsField("business_name", "  Volcán Tours  ")).toEqual({ ok: true, value: "Volcán Tours" });
    expect(parseSettingsField("business_name", "   ")).toEqual({
      ok: false,
      error: "El nombre comercial no puede quedar vacío.",
    });
    expect(parseSettingsField("business_name", "x".repeat(121)).ok).toBe(false);
  });

  it("acepta un email vacío o válido, en minúsculas", () => {
    expect(parseSettingsField("email", "")).toEqual({ ok: true, value: "" });
    expect(parseSettingsField("email", " Reservas@Volcan.es ")).toEqual({ ok: true, value: "reservas@volcan.es" });
    expect(parseSettingsField("email", "reservas@")).toEqual({ ok: false, error: "El email no es válido." });
  });

  it("solo admite teléfonos con caracteres de teléfono", () => {
    expect(parseSettingsField("phone", "+34 922 555 210")).toEqual({ ok: true, value: "+34 922 555 210" });
    expect(parseSettingsField("phone", "llámame").ok).toBe(false);
  });

  it("datos del titular: NIF en mayúsculas y plazo de conservación entre 6 y 120 meses", () => {
    expect(parseSettingsField("tax_id", " b12345678 ")).toEqual({ ok: true, value: "B12345678" });
    expect(parseSettingsField("tax_id", "B 1234").ok).toBe(false);
    expect(parseSettingsField("legal_name", "  Volcán Tours S.L. ")).toEqual({ ok: true, value: "Volcán Tours S.L." });
    expect(parseSettingsField("customer_retention_months", "24")).toEqual({ ok: true, value: 24 });
    expect(parseSettingsField("customer_retention_months", "3").ok).toBe(false);
  });

  it("solo admite las monedas de la lista", () => {
    expect(parseSettingsField("currency", "GBP")).toEqual({ ok: true, value: "GBP" });
    expect(parseSettingsField("currency", "JPY")).toEqual({ ok: false, error: "Moneda no admitida." });
  });

  it("convierte números de texto a enteros dentro de los límites", () => {
    expect(parseSettingsField("default_capacity", "16")).toEqual({ ok: true, value: 16 });
    expect(parseSettingsField("default_capacity", "0")).toEqual({ ok: false, error: "Aforo por defecto: mínimo 1." });
    expect(parseSettingsField("default_capacity", "501")).toEqual({ ok: false, error: "Aforo por defecto: máximo 500." });
    expect(parseSettingsField("cutoff_hours", "0")).toEqual({ ok: true, value: 0 });
    expect(parseSettingsField("cancel_hours", "1,5")).toEqual({ ok: false, error: "Cancelación gratuita: escribe un número." });
    expect(parseSettingsField("cancel_hours", "1.5")).toEqual({
      ok: false,
      error: "Cancelación gratuita: escribe un número entero.",
    });
  });

  it("un número vacío es un error, no un cero", () => {
    expect(parseSettingsField("cutoff_hours", "")).toEqual({ ok: false, error: "Cierre de venta: escribe un número." });
    expect(parseSettingsField("cutoff_hours", "  ").ok).toBe(false);
  });
});

describe("isSettingsField", () => {
  it("solo reconoce los campos editables (nunca id ni timezone)", () => {
    expect(isSettingsField("business_name")).toBe(true);
    expect(isSettingsField("customer_retention_months")).toBe(true);
    expect(isSettingsField("id")).toBe(false);
    expect(isSettingsField("timezone")).toBe(false);
    expect(isSettingsField("languages")).toBe(false);
    expect(isSettingsField("constructor")).toBe(false);
  });
});

describe("toggleLanguage", () => {
  it("añade un idioma respetando el orden de la lista", () => {
    expect(toggleLanguage(["de", "es"], "en", [])).toEqual({ ok: true, value: ["es", "en", "de"] });
  });

  it("quita un idioma que no usa ningún horario", () => {
    expect(toggleLanguage(["es", "en", "de"], "de", ["es", "en"])).toEqual({ ok: true, value: ["es", "en"] });
  });

  it("no deja el negocio sin idiomas", () => {
    expect(toggleLanguage(["es"], "es", [])).toEqual({ ok: false, error: "Tiene que quedar al menos un idioma." });
  });

  it("no quita un idioma que todavía usan los horarios", () => {
    expect(toggleLanguage(["es", "de"], "de", ["de"])).toEqual({
      ok: false,
      error: "Hay horarios en alemán. Cámbialos en Productos antes de quitar el idioma.",
    });
  });

  it("descarta códigos desconocidos que hubiera guardados", () => {
    expect(toggleLanguage(["es", "xx"], "en", [])).toEqual({ ok: true, value: ["es", "en"] });
  });
});

describe("isLanguageCode", () => {
  it("reconoce solo los idiomas de la lista", () => {
    expect(isLanguageCode("es")).toBe(true);
    expect(isLanguageCode("pt")).toBe(false);
    expect(isLanguageCode("toString")).toBe(false);
  });
});

describe("parseTicketTypeField", () => {
  it("valida nombre, condición y si ocupa plaza", () => {
    expect(parseTicketTypeField("name", " Senior ")).toEqual({ ok: true, value: "Senior" });
    expect(parseTicketTypeField("name", "")).toEqual({ ok: false, error: "El nombre de la entrada no puede quedar vacío." });
    expect(parseTicketTypeField("note", "")).toEqual({ ok: true, value: "" });
    expect(parseTicketTypeField("note", "x".repeat(121)).ok).toBe(false);
    expect(parseTicketTypeField("takes_seat", false)).toEqual({ ok: true, value: false });
    expect(parseTicketTypeField("takes_seat", "false").ok).toBe(false);
  });
});

describe("nextTicketTypeSort", () => {
  it("coloca el tipo nuevo al final", () => {
    expect(nextTicketTypeSort([])).toBe(1);
    expect(nextTicketTypeSort([{ sort: 1 }, { sort: 4 }, { sort: 2 }])).toBe(5);
  });
});

describe("productsLeftWithoutPrices", () => {
  const price = (product: string, type: string) => ({ product_id: product, ticket_type_id: type, products: { name: product } });

  it("detecta los productos que solo venden ese tipo", () => {
    const prices = [price("Teide", "adulto"), price("Teide", "nino"), price("Anaga", "nino"), price("Laguna", "adulto")];
    expect(productsLeftWithoutPrices(prices, "nino")).toEqual(["Anaga"]);
    expect(productsLeftWithoutPrices(prices, "adulto")).toEqual(["Laguna"]);
    expect(productsLeftWithoutPrices(prices, "bebe")).toEqual([]);
  });
});
