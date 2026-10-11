import { describe, expect, it } from "vitest";

import { internationalDigits, mailtoHref, telHref, whatsappHref } from "./contact";

describe("internationalDigits", () => {
  it("añade el 34 a los números españoles sin prefijo", () => {
    expect(internationalDigits("612 34 56 78")).toBe("34612345678");
    expect(internationalDigits("922-123-456")).toBe("34922123456");
  });

  it("respeta el prefijo con + o con 00", () => {
    expect(internationalDigits("+44 7700 900123")).toBe("447700900123");
    expect(internationalDigits("0049 151 2345678")).toBe("491512345678");
  });

  it("descarta lo que no es un teléfono", () => {
    expect(internationalDigits("")).toBeNull();
    expect(internationalDigits("1234")).toBeNull();
    expect(internationalDigits("no tengo")).toBeNull();
  });
});

describe("enlaces", () => {
  it("llamar y WhatsApp", () => {
    expect(telHref("612345678")).toBe("tel:+34612345678");
    expect(whatsappHref("+34 612 345 678")).toBe("https://wa.me/34612345678");
    expect(whatsappHref("")).toBeNull();
  });

  it("email", () => {
    expect(mailtoHref(" ana@example.com ")).toBe("mailto:ana@example.com");
    expect(mailtoHref("ana")).toBeNull();
  });
});
