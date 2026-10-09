import { describe, expect, it } from "vitest";

import {
  calendarHref,
  calendarTitle,
  groupByDate,
  longDayLabel,
  occupancyLevel,
  occupancyTotals,
  parseCalendarParams,
  rangeForDays,
  shiftAnchor,
  toBusinessDateTime,
  visibleDays,
  weekdayLabel,
} from "./calendar";

const TODAY = "2026-10-14";
const PRODUCT = "00000000-0000-4000-8000-000000000201";

describe("parseCalendarParams", () => {
  it("por defecto, semana de hoy con todos los productos", () => {
    expect(parseCalendarParams({}, TODAY)).toEqual({ view: "semana", anchor: TODAY, productId: null });
  });

  it("lee vista, fecha y producto", () => {
    expect(parseCalendarParams({ vista: "mes", fecha: "2026-12-03", producto: PRODUCT }, TODAY)).toEqual({
      view: "mes",
      anchor: "2026-12-03",
      productId: PRODUCT,
    });
  });

  it("ignora valores no válidos", () => {
    expect(parseCalendarParams({ vista: "año", fecha: "2026-02-30", producto: "x" }, TODAY)).toEqual({
      view: "semana",
      anchor: TODAY,
      productId: null,
    });
    expect(parseCalendarParams({ fecha: ["2026-11-01", "2026-12-01"] }, TODAY).anchor).toBe("2026-11-01");
  });
});

describe("visibleDays", () => {
  it("la semana va de lunes a domingo", () => {
    expect(visibleDays("semana", "2026-10-14")).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
    ]);
    expect(visibleDays("semana", "2026-10-18")[0]).toBe("2026-10-12");
  });

  it("el mes ocupa semanas enteras", () => {
    const days = visibleDays("mes", "2026-10-14");
    // Octubre de 2026 empieza en jueves y acaba en sábado.
    expect(days[0]).toBe("2026-09-28");
    expect(days[days.length - 1]).toBe("2026-11-01");
    expect(days).toHaveLength(35);
  });
});

describe("shiftAnchor", () => {
  it("mueve una semana o un mes", () => {
    expect(shiftAnchor("semana", "2026-10-14", 1)).toBe("2026-10-21");
    expect(shiftAnchor("semana", "2026-10-14", -1)).toBe("2026-10-07");
    expect(shiftAnchor("mes", "2026-01-31", 1)).toBe("2026-02-01");
    expect(shiftAnchor("mes", "2026-01-15", -1)).toBe("2025-12-01");
  });
});

describe("rangeForDays", () => {
  it("cubre los días en hora de Canarias, también con cambio de hora en medio", () => {
    // Semana del cambio de octubre: el lunes es horario de verano (UTC+1) y el lunes siguiente, de invierno.
    expect(rangeForDays(visibleDays("semana", "2026-10-25"))).toEqual({
      from: "2026-10-18T23:00:00.000Z",
      to: "2026-10-26T00:00:00.000Z",
    });
  });
});

describe("toBusinessDateTime", () => {
  it("pasa el instante a fecha y hora de Canarias", () => {
    expect(toBusinessDateTime("2026-07-15T23:30:00Z")).toEqual({ date: "2026-07-16", time: "00:30" });
    expect(toBusinessDateTime("2026-12-15T16:30:00+00:00")).toEqual({ date: "2026-12-15", time: "16:30" });
  });
});

describe("títulos", () => {
  it("semana y mes en español", () => {
    expect(calendarTitle("semana", "2026-10-14")).toBe("12 oct – 18 oct");
    expect(calendarTitle("mes", "2026-10-14")).toBe("octubre de 2026");
    expect(weekdayLabel("2026-10-12")).toBe("lun 12");
  });
});

describe("occupancyLevel", () => {
  it("sigue los umbrales del prototipo", () => {
    expect(occupancyLevel(0, 20)).toBe(0);
    expect(occupancyLevel(1, 20)).toBe(1);
    expect(occupancyLevel(6, 20)).toBe(2);
    expect(occupancyLevel(12, 20)).toBe(3);
    expect(occupancyLevel(19, 20)).toBe(4);
    expect(occupancyLevel(3, 0)).toBe(0);
  });
});

describe("groupByDate", () => {
  it("agrupa manteniendo el orden", () => {
    const groups = groupByDate([
      { date: "2026-10-12", id: 1 },
      { date: "2026-10-13", id: 2 },
      { date: "2026-10-12", id: 3 },
    ]);
    expect(groups.get("2026-10-12")?.map((item) => item.id)).toEqual([1, 3]);
    expect(groups.get("2026-10-14")).toBeUndefined();
  });
});

describe("calendarHref", () => {
  it("omite los valores por defecto", () => {
    expect(calendarHref({ view: "semana", productId: null })).toBe("/panel/calendario");
    expect(calendarHref({ view: "mes", anchor: "2026-11-01", productId: PRODUCT })).toBe(
      `/panel/calendario?vista=mes&fecha=2026-11-01&producto=${PRODUCT}`,
    );
  });
});

describe("occupancyTotals", () => {
  it("no cuenta las salidas canceladas", () => {
    expect(
      occupancyTotals([
        { booked: 4, capacity: 16, status: "open" },
        { booked: 2, capacity: 10, status: "closed" },
        { booked: 0, capacity: 20, status: "cancelled" },
      ]),
    ).toEqual({ booked: 6, capacity: 26 });
  });
});

describe("longDayLabel", () => {
  it("día de la semana, número y mes", () => {
    expect(longDayLabel("2026-10-14")).toBe("miércoles 14 de octubre");
  });
});
