import { describe, expect, it } from "vitest";

import {
  bookableDays,
  distinctLanguages,
  isSlug,
  isWebBookable,
  monthGrid,
  monthTitle,
  parseStorefrontParams,
  parseTicketsParam,
  seatsLeftLabel,
  shiftMonth,
  storefrontHref,
  ticketsParam,
} from "./storefront";

const NOW = new Date("2026-10-09T10:00:00Z");
const A = "00000000-0000-4000-8000-0000000000aa";
const B = "00000000-0000-4000-8000-0000000000bb";

describe("isWebBookable", () => {
  const session = { status: "open" as const, free: 4, startsAt: new Date("2026-10-10T10:00:00Z") };

  it("vende salidas abiertas, con plazas y fuera del cierre de venta", () => {
    expect(isWebBookable(session, NOW, 2)).toBe(true);
    expect(isWebBookable(session, NOW, 24)).toBe(true);
    expect(isWebBookable(session, NOW, 25)).toBe(false);
  });

  it("no vende cerradas, canceladas, completas ni pasadas", () => {
    expect(isWebBookable({ ...session, status: "closed" }, NOW, 0)).toBe(false);
    expect(isWebBookable({ ...session, status: "cancelled" }, NOW, 0)).toBe(false);
    expect(isWebBookable({ ...session, free: 0 }, NOW, 0)).toBe(false);
    expect(isWebBookable({ ...session, startsAt: NOW }, NOW, 0)).toBe(false);
  });
});

describe("bookableDays", () => {
  it("agrupa por día en orden de fecha y hora", () => {
    const days = bookableDays([
      { id: "c", date: "2026-10-12", time: "16:30" },
      { id: "b", date: "2026-10-11", time: "09:00" },
      { id: "a", date: "2026-10-12", time: "09:00" },
    ]);
    expect([...days.keys()]).toEqual(["2026-10-11", "2026-10-12"]);
    expect(days.get("2026-10-12")?.map((session) => session.id)).toEqual(["a", "c"]);
  });
});

describe("parseStorefrontParams", () => {
  const days = new Map([
    ["2026-11-14", [{ id: A }]],
    ["2026-12-02", [{ id: B }]],
  ]);
  const today = "2026-10-09";

  it("sin parámetros abre el primer mes con salidas", () => {
    expect(parseStorefrontParams({}, days, today)).toEqual({ month: "2026-11", date: null, sessionId: null });
  });

  it("acepta día y salida si se venden", () => {
    expect(parseStorefrontParams({ fecha: "2026-11-14", salida: A.toUpperCase() }, days, today)).toEqual({
      month: "2026-11",
      date: "2026-11-14",
      sessionId: A,
    });
  });

  it("ignora días sin salidas y salidas de otro día", () => {
    expect(parseStorefrontParams({ fecha: "2026-11-15" }, days, today).date).toBeNull();
    expect(parseStorefrontParams({ fecha: "2026-11-14", salida: B }, days, today).sessionId).toBeNull();
    expect(parseStorefrontParams({ salida: A }, days, today).sessionId).toBeNull();
  });

  it("mantiene el mes entre hoy y el último mes con salidas", () => {
    expect(parseStorefrontParams({ mes: "2026-12" }, days, today).month).toBe("2026-12");
    expect(parseStorefrontParams({ mes: "2026-01" }, days, today).month).toBe("2026-10");
    expect(parseStorefrontParams({ mes: "2027-05" }, days, today).month).toBe("2026-12");
    expect(parseStorefrontParams({ mes: "2026-13" }, days, today).month).toBe("2026-11");
    expect(parseStorefrontParams({}, new Map(), today).month).toBe("2026-10");
  });
});

describe("calendario del mes", () => {
  it("monthGrid da semanas de lunes a domingo con huecos", () => {
    const weeks = monthGrid("2026-11");
    // Noviembre de 2026 empieza en domingo y acaba en lunes.
    expect(weeks[0]).toEqual([null, null, null, null, null, null, "2026-11-01"]);
    expect(weeks.at(-1)).toEqual(["2026-11-30", null, null, null, null, null, null]);
    expect(weeks).toHaveLength(6);
    expect(monthGrid("2027-02")).toHaveLength(4);
  });

  it("shiftMonth y monthTitle", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(monthTitle("2026-11")).toBe("noviembre de 2026");
  });
});

describe("textos y URLs", () => {
  it("storefrontHref solo escribe lo que hay", () => {
    expect(storefrontHref("teide", {})).toBe("/experiencias/teide");
    expect(storefrontHref("teide", { month: "2026-11", date: "2026-11-14", sessionId: A })).toBe(
      `/experiencias/teide?mes=2026-11&fecha=2026-11-14&salida=${A}`,
    );
  });

  it("isSlug acepta los slugs de slugify", () => {
    expect(isSlug("teide-atardecer-estrellas")).toBe(true);
    expect(isSlug("teide-2")).toBe(true);
    for (const value of ["", "Teide", "teide--2", "-teide", "teide-", "te ide", "%2e%2e", "a".repeat(101)]) {
      expect(isSlug(value)).toBe(false);
    }
  });

  it("seatsLeftLabel avisa con 5 o menos", () => {
    expect(seatsLeftLabel(1)).toEqual({ text: "¡Queda 1!", low: true });
    expect(seatsLeftLabel(5)).toEqual({ text: "¡Quedan 5!", low: true });
    expect(seatsLeftLabel(12)).toEqual({ text: "12 plazas", low: false });
  });

  it("distinctLanguages quita repetidos", () => {
    expect(distinctLanguages(["es", "en", "es"])).toEqual(["es", "en"]);
  });
});

describe("entradas en la URL", () => {
  it("ida y vuelta sin las que están a 0", () => {
    const raw = ticketsParam({ [A]: 2, [B]: 0 });
    expect(raw).toBe(`${A}:2`);
    expect(parseTicketsParam(raw)).toEqual([{ ticketTypeId: A, qty: 2 }]);
  });

  it("rechaza lo que no es válido", () => {
    for (const raw of [undefined, "", `${A}:0`, `${A}:101`, `${A}:2,${A}:1`, "x:1", `${A}:1:2`, `${A}:-1`, `${A}`]) {
      expect(parseTicketsParam(raw)).toBeNull();
    }
  });
});
