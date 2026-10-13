import { describe, expect, it } from "vitest";

import { HOUR_PX, MIN_BLOCK_PX, dayLayout, daySummary, hourMarks, nowOffset } from "@/lib/domain/day-view";

const session = (id: string, time: string, endTime: string, extra: Partial<{ status: string; booked: number; capacity: number }> = {}) => ({
  id,
  time,
  endTime,
  status: "open",
  booked: 0,
  capacity: 16,
  ...extra,
});

describe("dayLayout", () => {
  it("coloca cada salida según su hora y lo que dura", () => {
    const { window, blocks, height } = dayLayout([session("a", "10:30", "13:30"), session("b", "16:30", "22:30")]);
    expect(window).toEqual({ start: 10 * 60, end: 23 * 60 });
    expect(height).toBe(13 * HOUR_PX);
    expect(blocks.get("a")).toEqual({ top: 0.5 * HOUR_PX, height: 3 * HOUR_PX, lane: 0, lanes: 1 });
    expect(blocks.get("b")?.top).toBe(6.5 * HOUR_PX);
  });

  it("las que coinciden van en carriles distintos", () => {
    const { blocks } = dayLayout([session("a", "09:00", "12:00"), session("b", "10:00", "11:00"), session("c", "12:00", "13:00")]);
    expect(blocks.get("a")).toMatchObject({ lane: 0, lanes: 2 });
    expect(blocks.get("b")).toMatchObject({ lane: 1, lanes: 2 });
    // Empieza cuando acaba la primera: reutiliza su carril.
    expect(blocks.get("c")).toMatchObject({ lane: 0 });
  });

  it("una salida corta tiene un alto mínimo", () => {
    expect(dayLayout([session("a", "10:00", "10:15")]).blocks.get("a")?.height).toBe(MIN_BLOCK_PX);
  });
});

describe("hourMarks", () => {
  it("una marca por hora, extremos incluidos", () => {
    expect(hourMarks({ start: 8 * 60, end: 11 * 60 })).toEqual([480, 540, 600, 660]);
  });
});

describe("daySummary", () => {
  it("suma sin las canceladas y cuenta las que tienen reservas sin equipo", () => {
    expect(
      daySummary([
        { status: "open", booked: 8, capacity: 16, unstaffed: true },
        { status: "closed", booked: 4, capacity: 16 },
        { status: "open", booked: 0, capacity: 16, unstaffed: true },
        { status: "cancelled", booked: 0, capacity: 20 },
      ]),
    ).toEqual({ sessions: 3, booked: 12, capacity: 48, percent: 25, unstaffed: 1 });
  });

  it("un día sin salidas", () => {
    expect(daySummary([])).toEqual({ sessions: 0, booked: 0, capacity: 0, percent: 0, unstaffed: 0 });
  });
});

describe("nowOffset", () => {
  const window = { start: 8 * 60, end: 20 * 60 };
  it("dentro de la franja, su distancia; fuera, nada", () => {
    expect(nowOffset(9 * 60, window)).toBe(HOUR_PX);
    expect(nowOffset(7 * 60, window)).toBeNull();
    expect(nowOffset(21 * 60, window)).toBeNull();
  });
});
