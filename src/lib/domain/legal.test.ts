import { describe, expect, it } from "vitest";

import { isLegalDoc, LEGAL_DOCS, legalDocument, ownerLine, type LegalInfo } from "./legal";

const info: LegalInfo = {
  businessName: "Volcán Tours",
  legalName: "Volcán Tours S.L.",
  taxId: "B12345678",
  address: "Calle La Marina 1, Santa Cruz de Tenerife",
  registryInfo: "",
  tourismRegistry: "",
  email: "reservas@volcan.es",
  phone: "+34 922 555 210",
  cancelHours: 24,
  retentionMonths: 24,
};

describe("textos legales", () => {
  it("reconoce solo los tres documentos", () => {
    expect(LEGAL_DOCS.every(isLegalDoc)).toBe(true);
    expect(isLegalDoc("aviso")).toBe(false);
    expect(isLegalDoc(undefined)).toBe(false);
  });

  it("identifica al titular con lo que haya en Ajustes", () => {
    expect(ownerLine(info, "es")).toBe("Volcán Tours S.L. (NIF B12345678), Calle La Marina 1, Santa Cruz de Tenerife");
    expect(ownerLine({ ...info, legalName: " ", taxId: "", address: "" }, "es")).toBe("Volcán Tours");
    expect(ownerLine(info, "en")).toContain("(Tax ID B12345678)");
  });

  it("la privacidad dice el plazo de conservación y cómo ejercer los derechos", () => {
    const doc = legalDocument("privacidad", "es", { ...info, retentionMonths: 36 });
    const text = doc.sections.flatMap((section) => section.paragraphs).join(" ");
    expect(doc.title).toBe("Política de privacidad");
    expect(text).toContain("36 meses después de tu última excursión");
    expect(text).toContain("reservas@volcan.es o +34 922 555 210");
    expect(text).toContain("www.aepd.es");
  });

  it("las condiciones usan el plazo de cancelación gratuita de Ajustes", () => {
    const text = (hours: number, locale: "es" | "en") =>
      legalDocument("condiciones", locale, { ...info, cancelHours: hours })
        .sections.flatMap((section) => section.paragraphs)
        .join(" ");
    expect(text(48, "es")).toContain("hasta 48 horas antes");
    expect(text(0, "es")).toContain("no tienen cancelación gratuita");
    expect(text(48, "en")).toContain("up to 48 hours before");
    expect(text(48, "es")).toContain("no se aplica el derecho de desistimiento");
  });

  it("el aviso legal añade los registros mercantil y turístico si los hay", () => {
    const text = legalDocument("condiciones", "es", { ...info, registryInfo: "Tomo 1, folio 2, hoja TF-3", tourismRegistry: "AT-38-1234" })
      .sections[0]?.paragraphs.join(" ");
    expect(text).toContain("Registro Mercantil: Tomo 1, folio 2, hoja TF-3.");
    expect(text).toContain("Registro General Turístico de Canarias n.º AT-38-1234.");
    expect(legalDocument("condiciones", "es", info).sections[0]?.paragraphs).toHaveLength(1);
  });

  it("los mismos apartados en español e inglés, con fecha de revisión", () => {
    for (const doc of LEGAL_DOCS) {
      const es = legalDocument(doc, "es", info);
      const en = legalDocument(doc, "en", info);
      expect(en.sections).toHaveLength(es.sections.length);
    }
    expect(legalDocument("cookies", "es", info).updated).toBe("10 de octubre de 2026");
    expect(legalDocument("cookies", "en", info).updated).toBe("10 October 2026");
  });

  it("sin email ni teléfono, remite a los datos de la web", () => {
    const text = legalDocument("privacidad", "es", { ...info, email: "", phone: "" })
      .sections.flatMap((section) => section.paragraphs)
      .join(" ");
    expect(text).toContain("con los datos de contacto de esta web");
  });
});
