import { describe, expect, it } from "vitest";

import { buildReport, chartTop, niceStep, parseReportPeriod, reportRange, reportSummarySchema, roundToEuros, type ReportSummary } from "./reports";

const empty: ReportSummary = {
  bookings: 0,
  revenue_cents: 0,
  pax: 0,
  capacity: 0,
  booked_seats: 0,
  days: [],
  products: [],
  channels: [],
  languages: [],
};

describe("parseReportPeriod", () => {
  it("por defecto, los últimos 30 días", () => {
    expect(parseReportPeriod(undefined)).toBe("pasados");
    expect(parseReportPeriod("x")).toBe("pasados");
    expect(parseReportPeriod(["futuros"])).toBe("futuros");
  });
});

describe("reportRange", () => {
  it("pasados: hoy y los 29 días anteriores", () => {
    const range = reportRange("pasados", "2030-03-15");
    expect(range).toMatchObject({ from: "2030-02-14", to: "2030-03-15" });
    expect(range.days).toHaveLength(30);
  });

  it("futuros: hoy y los 29 siguientes, también con cambio de hora", () => {
    const range = reportRange("futuros", "2030-03-15");
    expect(range).toMatchObject({ from: "2030-03-15", to: "2030-04-13" });
    expect(new Set(range.days).size).toBe(30);
  });
});

describe("eje del gráfico", () => {
  it("niceStep da la mitad de 1, 2, 5 o 10 × 10ⁿ", () => {
    expect(niceStep(0)).toBe(0.5);
    expect(niceStep(3)).toBe(2.5);
    expect(niceStep(18)).toBe(10);
    expect(niceStep(1234)).toBe(1000);
  });

  it("chartTop redondea el máximo hacia arriba y usa 100 € si no hay ingresos", () => {
    expect(chartTop(0)).toBe(10_000);
    expect(chartTop(123_456)).toBe(200_000);
    expect(chartTop(1_800)).toBe(2_000);
  });
});

describe("buildReport", () => {
  const days = reportRange("futuros", "2030-07-01").days;
  const summary: ReportSummary = {
    bookings: 3,
    revenue_cents: 15_000,
    pax: 7,
    capacity: 40,
    booked_seats: 10,
    days: [
      { day: "2030-07-01", revenue_cents: 5_000 },
      { day: "2030-07-03", revenue_cents: 10_000 },
    ],
    products: [
      { id: "a", name: "Anaga", color: "#30B158", revenue_cents: 0, capacity: 0, booked_seats: 0 },
      { id: "t", name: "Teide", color: "#0A84FF", revenue_cents: 15_000, capacity: 40, booked_seats: 10 },
    ],
    channels: [
      { channel: "phone", revenue_cents: 5_000 },
      { channel: "web", revenue_cents: 10_000 },
    ],
    languages: [
      { language: "es", pax: 3 },
      { language: "en", pax: 4 },
    ],
  };
  const report = buildReport(summary, days, "2030-07-01");

  it("indicadores: ingresos, pasajeros por reserva, ticket medio y ocupación", () => {
    expect(report.kpis).toEqual({
      revenueCents: 15_000,
      bookings: 3,
      pax: 7,
      paxPerBooking: "2,3",
      avgTicketCents: 5_000,
      occupancyPercent: 25,
      bookedSeats: 10,
      capacity: 40,
    });
  });

  it("una barra por día, con los días sin ingresos a cero y los futuros marcados", () => {
    expect(report.days).toHaveLength(30);
    expect(report.chartTopCents).toBe(10_000);
    expect(report.days[0]).toEqual({ day: "2030-07-01", revenueCents: 5_000, heightPercent: 50, future: false });
    expect(report.days[1]).toEqual({ day: "2030-07-02", revenueCents: 0, heightPercent: 0, future: true });
    expect(report.days[2]?.heightPercent).toBe(100);
  });

  it("productos por ingresos, canales en el orden del prototipo e idiomas por pasajeros", () => {
    expect(report.products.map((product) => [product.name, product.widthPercent, product.occupancyPercent])).toEqual([
      ["Teide", 100, 25],
      ["Anaga", 0, 0],
    ]);
    expect(report.channels.map((channel) => [channel.label, Math.round(channel.sharePercent)])).toEqual([
      ["Web", 67],
      ["Mostrador", 0],
      ["Teléfono", 33],
      ["Agencia", 0],
    ]);
    expect(report.languages.map((language) => [language.label, language.pax, language.widthPercent])).toEqual([
      ["Inglés", 4, 100],
      ["Español", 3, 75],
    ]);
  });

  it("sin datos no divide entre cero", () => {
    const blank = buildReport(empty, days, "2030-07-01");
    expect(blank.kpis).toMatchObject({ paxPerBooking: "0,0", avgTicketCents: 0, occupancyPercent: 0 });
    expect(blank.channels.every((channel) => channel.sharePercent === 0)).toBe(true);
    expect(blank.languages).toEqual([]);
  });
});

describe("reportSummarySchema", () => {
  it("acepta el resumen de la BD y rechaza importes no enteros", () => {
    expect(reportSummarySchema.safeParse(empty).success).toBe(true);
    expect(reportSummarySchema.safeParse({ ...empty, revenue_cents: 1.5 }).success).toBe(false);
  });
});

describe("roundToEuros", () => {
  it("redondea al euro", () => {
    expect(roundToEuros(12_349)).toBe(12_300);
    expect(roundToEuros(12_350)).toBe(12_400);
  });
});
