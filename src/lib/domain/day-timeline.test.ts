import { describe, expect, it } from "vitest";

import {
  countdownText,
  dayMoment,
  dayStory,
  firstName,
  greeting,
  sessionProgress,
  sessionSpan,
  tickLabel,
  timelineLanes,
  timelinePercent,
  timelineTicks,
  timelineWindow,
  type TimelineSession,
} from "@/lib/domain/day-timeline";

const session = (id: string, time: string, endTime: string, status = "open"): TimelineSession => ({
  id,
  time,
  endTime,
  status,
  capacity: 16,
  booked: 4,
});

describe("sessionSpan", () => {
  it("pasa de 24 h si termina después de medianoche", () => {
    expect(sessionSpan({ time: "21:00", endTime: "01:30" })).toEqual({ start: 1260, end: 1530 });
  });
});

describe("timelineWindow", () => {
  it("usa 08:00–20:00 si no hay salidas", () => {
    expect(timelineWindow([])).toEqual({ start: 480, end: 1200 });
  });

  it("abarca las salidas en horas enteras", () => {
    expect(timelineWindow([session("a", "09:15", "13:00"), session("b", "16:30", "21:10")])).toEqual({ start: 540, end: 1320 });
  });

  it("nunca es más corta de 6 h", () => {
    expect(timelineWindow([session("a", "16:30", "19:00")])).toEqual({ start: 900, end: 1260 });
    expect(timelineWindow([session("a", "00:30", "02:00")])).toEqual({ start: 0, end: 360 });
  });
});

describe("timelinePercent y marcas", () => {
  const window = { start: 480, end: 1200 };

  it("sitúa y recorta a la franja", () => {
    expect(timelinePercent(840, window)).toBe(50);
    expect(timelinePercent(100, window)).toBe(0);
    expect(timelinePercent(1300, window)).toBe(100);
  });

  it("pone como mucho siete marcas", () => {
    expect(timelineTicks(window).map(tickLabel)).toEqual(["08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00"]);
    expect(timelineTicks({ start: 900, end: 1260 })).toHaveLength(7);
    expect(tickLabel(1500)).toBe("01:00");
  });
});

describe("timelineLanes", () => {
  it("pone en otro carril las salidas que se solapan", () => {
    const { lanes, count } = timelineLanes([
      session("a", "09:00", "12:00"),
      session("b", "10:00", "11:00"),
      session("c", "12:00", "14:00"),
      session("d", "11:30", "13:00"),
    ]);
    expect(count).toBe(2);
    expect(Object.fromEntries(lanes)).toEqual({ a: 0, b: 1, d: 1, c: 0 });
  });
});

describe("dayMoment", () => {
  const sessions = [
    session("a", "09:00", "12:00"),
    session("b", "10:00", "11:00", "cancelled"),
    session("c", "13:00", "15:00"),
    session("d", "12:30", "14:00"),
  ];

  it("da las salidas en marcha y la próxima con lo que falta", () => {
    const moment = dayMoment(sessions, 10 * 60 + 30);
    expect(moment.live.map((item) => item.id)).toEqual(["a"]);
    expect(moment.next?.session.id).toBe("d");
    expect(moment.next?.minutesUntil).toBe(120);
  });

  it("no hay próxima al acabar el día", () => {
    expect(dayMoment(sessions, 16 * 60)).toEqual({ live: [], next: null });
  });

  it("calcula lo recorrido", () => {
    expect(sessionProgress(sessions[0]!, 10 * 60 + 30)).toBe(50);
  });
});

describe("textos", () => {
  it("cuenta atrás", () => {
    expect(countdownText(0)).toBe("ahora");
    expect(countdownText(25)).toBe("en 25 min");
    expect(countdownText(60)).toBe("en 1 h");
    expect(countdownText(125)).toBe("en 2 h 05 min");
  });

  it("saluda según la hora", () => {
    expect(greeting(8)).toBe("Buenos días");
    expect(greeting(16)).toBe("Buenas tardes");
    expect(greeting(23)).toBe("Buenas noches");
    expect(greeting(3)).toBe("Buenas noches");
    expect(firstName("  Alberto Flores ")).toBe("Alberto");
  });

  it("resume el día", () => {
    expect(dayStory("Hoy", { sessions: 4, pax: 38, checkedIn: 12 })).toBe("Hoy salen 4 tours con 38 pasajeros. Ya han llegado 12.");
    expect(dayStory("Hoy", { sessions: 1, pax: 1, checkedIn: 1 })).toBe("Hoy sale 1 tour con 1 pasajero. Ya han llegado todos.");
    expect(dayStory("Hoy", { sessions: 2, pax: 5, checkedIn: 0 })).toBe("Hoy salen 2 tours con 5 pasajeros.");
    expect(dayStory("Próximamente", { sessions: 3, pax: 20, checkedIn: 0 })).toBe("Salen 3 tours con 20 pasajeros reservados.");
    expect(dayStory("Día pasado", { sessions: 2, pax: 9, checkedIn: 8 })).toBe("Salieron 2 tours con 9 pasajeros; se presentaron 8.");
    expect(dayStory("Día pasado", { sessions: 0, pax: 0, checkedIn: 0 })).toBe("Este día no hubo salidas.");
  });
});
