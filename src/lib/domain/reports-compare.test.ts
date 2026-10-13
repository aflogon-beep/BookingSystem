import { describe, expect, it } from "vitest";

import { buildHeatmap, heatLevel, kpiDeltas, percentDelta, pointsDelta, previousRange, productPodium, slotText } from "./reports";

describe("previousRange", () => {
  it("son los 30 días justo antes", () => {
    expect(previousRange({ from: "2026-09-14" })).toEqual({ from: "2026-08-15", to: "2026-09-13" });
  });
});

describe("percentDelta y pointsDelta", () => {
  it("sube, baja o se queda igual", () => {
    expect(percentDelta(1120, 1000)).toEqual({ text: "+12 %", direction: "up" });
    expect(percentDelta(920, 1000)).toEqual({ text: "−8 %", direction: "down" });
    expect(percentDelta(1001, 1000)).toEqual({ text: "=", direction: "flat" });
  });

  it("sin dato anterior es «nuevo», o nada si no hay nada", () => {
    expect(percentDelta(500, 0)).toEqual({ text: "nuevo", direction: "up" });
    expect(percentDelta(0, 0)).toBeNull();
  });

  it("la ocupación va en puntos", () => {
    expect(pointsDelta(72, 68)).toEqual({ text: "+4 pts", direction: "up" });
    expect(pointsDelta(60, 62)).toEqual({ text: "−2 pts", direction: "down" });
  });
});

describe("kpiDeltas", () => {
  const kpis = { revenueCents: 0, bookings: 0, pax: 0, paxPerBooking: "0", avgTicketCents: 0, occupancyPercent: 0, bookedSeats: 0, capacity: 0 };
  it("sin salidas antes no compara la ocupación", () => {
    const deltas = kpiDeltas({ ...kpis, revenueCents: 1000, capacity: 10, occupancyPercent: 50 }, kpis);
    expect(deltas.revenue?.text).toBe("nuevo");
    expect(deltas.occupancy).toBeNull();
  });
});

describe("productPodium", () => {
  const products = [
    { id: "a", name: "Teide", color: "#000", revenueCents: 50_000 },
    { id: "b", name: "Masca", color: "#111", revenueCents: 30_000 },
    { id: "c", name: "Ballenas", color: "#222", revenueCents: 30_000 },
    { id: "d", name: "Anaga", color: "#333", revenueCents: 10_000 },
    { id: "e", name: "Sin ventas", color: "#444", revenueCents: 0 },
  ];

  it("los tres que más ingresan, con su variación", () => {
    const { podium } = productPodium(products, [
      { id: "a", revenueCents: 40_000 },
      { id: "b", revenueCents: 30_000 },
    ]);
    expect(podium.map((entry) => entry.id)).toEqual(["a", "c", "b"]);
    expect(podium[0]?.delta?.text).toBe("+25 %");
    expect(podium[1]?.delta?.text).toBe("nuevo");
  });

  it("el que más crece entre los que ya vendían", () => {
    const { rising } = productPodium(products, [
      { id: "a", revenueCents: 40_000 },
      { id: "d", revenueCents: 5_000 },
    ]);
    expect(rising).toMatchObject({ id: "d", growthPercent: 100 });
  });

  it("sin periodo anterior no hay variaciones", () => {
    const { podium, rising } = productPodium(products, null);
    expect(podium[0]?.delta).toBeNull();
    expect(rising).toBeNull();
  });
});

describe("buildHeatmap", () => {
  it("cuadrícula de lunes a domingo por hora, con el mejor y el peor hueco", () => {
    const heatmap = buildHeatmap([
      { weekday: 6, time: "16:30", sessions: 4, capacity: 64, booked_seats: 60 },
      { weekday: 2, time: "09:00", sessions: 4, capacity: 64, booked_seats: 8 },
      { weekday: 2, time: "16:30", sessions: 4, capacity: 64, booked_seats: 32 },
    ]);
    expect(heatmap.times).toEqual(["09:00", "16:30"]);
    expect(heatmap.rows).toHaveLength(7);
    expect(heatmap.rows[1]?.cells.map((cell) => cell.occupancyPercent)).toEqual([13, 50]);
    expect(heatmap.rows[0]?.cells[0]).toMatchObject({ sessions: 0, occupancyPercent: null, level: 0 });
    expect(heatmap.best).toMatchObject({ weekday: 6, time: "16:30", occupancyPercent: 94 });
    expect(heatmap.worst).toMatchObject({ weekday: 2, time: "09:00" });
  });

  it("con un solo hueco no hay mejor ni peor", () => {
    const heatmap = buildHeatmap([{ weekday: 1, time: "10:00", sessions: 1, capacity: 10, booked_seats: 5 }]);
    expect(heatmap.best).toBeNull();
  });

  it("niveles de color y texto del hueco", () => {
    expect([null, 0, 30, 60, 90].map(heatLevel)).toEqual([0, 1, 2, 3, 4]);
    expect(slotText({ weekday: 6, time: "16:30" })).toBe("los sábados a las 16:30");
    expect(slotText({ weekday: 1, time: "09:00" })).toBe("los lunes a las 09:00");
  });
});
