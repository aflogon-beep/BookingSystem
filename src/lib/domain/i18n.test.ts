import { describe, expect, it } from "vitest";

import { longDayLabel } from "./calendar";
import { isLocale, isPublicPath, localizedPath, splitLocale } from "./i18n";
import { formatCents, formatWholeEuros } from "./money";
import { monthTitle, seatsLeftLabel } from "./storefront";
import { resolveCart, webBookingErrorMessage, webCustomerSchemaFor } from "./web-checkout";
import { languageName, webText } from "./web-text";

describe("rutas por idioma", () => {
  it("separa el prefijo /en", () => {
    expect(splitLocale("/en")).toEqual({ locale: "en", path: "/" });
    expect(splitLocale("/en/experiencias/teide")).toEqual({ locale: "en", path: "/experiencias/teide" });
    expect(splitLocale("/experiencias/teide")).toEqual({ locale: "es", path: "/experiencias/teide" });
    expect(splitLocale("/")).toEqual({ locale: "es", path: "/" });
    // «/english» no es el prefijo.
    expect(splitLocale("/english")).toEqual({ locale: "es", path: "/english" });
    expect(splitLocale("/es/experiencias/teide")).toEqual({ locale: "es", path: "/es/experiencias/teide" });
  });

  it("solo la web pública tiene versión en inglés", () => {
    expect(isPublicPath("/")).toBe(true);
    expect(isPublicPath("/experiencias/teide")).toBe(true);
    expect(isPublicPath("/experiencias/teide/reservar")).toBe(true);
    expect(isPublicPath("/reserva/VT123456")).toBe(true);
    expect(isPublicPath("/experiencias")).toBe(false);
    expect(isPublicPath("/experiencias/")).toBe(false);
    expect(isPublicPath("/panel")).toBe(false);
    expect(isPublicPath("/login")).toBe(false);
    expect(isPublicPath("/api/cron/salidas")).toBe(false);
  });

  it("añade el prefijo y conserva la búsqueda", () => {
    expect(localizedPath("es", "/experiencias/teide?mes=2026-11")).toBe("/experiencias/teide?mes=2026-11");
    expect(localizedPath("en", "/experiencias/teide?mes=2026-11")).toBe("/en/experiencias/teide?mes=2026-11");
    expect(localizedPath("en", "/")).toBe("/en");
    expect(localizedPath("en", "/?x=1")).toBe("/en?x=1");
    expect(localizedPath("es", "/")).toBe("/");
  });

  it("solo acepta los idiomas de la web", () => {
    expect(isLocale("es")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("de")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});

describe("textos y formatos en inglés", () => {
  it("formatea importes al estilo británico", () => {
    expect(formatCents(4500, "en")).toBe("€45");
    expect(formatCents(1250, "en")).toBe("€12.50");
    expect(formatWholeEuros(14950, "en")).toBe("€150");
  });

  it("fechas y meses en inglés", () => {
    expect(longDayLabel("2026-11-14", "en")).toBe("Saturday 14 November");
    expect(longDayLabel("2026-11-14")).toBe("sábado 14 de noviembre");
    expect(monthTitle("2026-11", "en")).toBe("November 2026");
    expect(monthTitle("2026-11")).toBe("noviembre de 2026");
  });

  it("plazas libres e idiomas de la salida", () => {
    expect(seatsLeftLabel(1, "en")).toEqual({ text: "1 left!", low: true });
    expect(seatsLeftLabel(12, "en")).toEqual({ text: "12 spots", low: false });
    expect(languageName("en", "en")).toBe("English");
    expect(languageName("en", "es")).toBe("Inglés");
    expect(languageName("pt", "en")).toBe("PT");
  });

  it("errores de la reserva en inglés", () => {
    const tickets = [{ id: "a", name: "Adult", takesSeat: true, priceCents: 4500 }];
    expect(resolveCart(tickets, [{ ticketTypeId: "a", qty: 3 }], 2, "en")).toEqual({
      ok: false,
      error: "Only 2 spots left on this tour.",
    });
    expect(webBookingErrorMessage("RB001", "0", "en")).toBe(webText("en").errors.justSoldOut);
    expect(webBookingErrorMessage("RB008", undefined, "en")).toBe("You can book up to 10 spots online. For groups, give us a call.");
    const parsed = webCustomerSchemaFor("en").safeParse({ name: " ", email: "x@example.com" });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe("Please enter your full name.");
  });

  it("los dos idiomas tienen los mismos textos", () => {
    expect(Object.keys(webText("en")).sort()).toEqual(Object.keys(webText("es")).sort());
    expect(Object.keys(webText("en").errors).sort()).toEqual(Object.keys(webText("es").errors).sort());
  });
});
