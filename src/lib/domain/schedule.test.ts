import { describe, expect, it } from "vitest";

import { businessToday, daysLabel, parseTimes, previewSessions, shortDateLabel, type RuleForPreview } from "./schedule";

describe("parseTimes", () => {
  it("normaliza, ordena y quita repetidas", () => {
    expect(parseTimes("17:30, 9:00; 09:00 10:15")).toEqual(["09:00", "10:15", "17:30"]);
  });

  it("ignora lo que no es una hora válida", () => {
    expect(parseTimes("24:00, 10:60, 7, mañana, 23:59")).toEqual(["23:59"]);
    expect(parseTimes("")).toEqual([]);
  });
});

describe("daysLabel", () => {
  it("resume los patrones habituales como el prototipo", () => {
    expect(daysLabel([1, 2, 3, 4, 5, 6, 7])).toBe("Todos los días");
    expect(daysLabel([5, 4, 3, 2, 1])).toBe("Lun–Vie");
    expect(daysLabel([1, 2, 3, 4, 5, 6])).toBe("Lun–Sáb");
    expect(daysLabel([7, 6])).toBe("Fines de semana");
    expect(daysLabel([4, 2])).toBe("Mar, Jue");
  });
});

describe("businessToday", () => {
  it("usa la fecha de Canarias, no la UTC", () => {
    // 23:30 UTC del 31 de octubre de 2026 = 23:30 en Canarias (horario de invierno, UTC+0).
    expect(businessToday(new Date("2026-10-31T23:30:00Z"))).toBe("2026-10-31");
    // 23:30 UTC del 30 de junio = 00:30 del 1 de julio en Canarias (horario de verano, UTC+1).
    expect(businessToday(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01");
  });
});

const rule = (overrides: Partial<RuleForPreview>): RuleForPreview => ({
  weekdays: [1, 2, 3, 4, 5, 6, 7],
  times: ["10:00"],
  language: "es",
  validFrom: null,
  validTo: null,
  ...overrides,
});

describe("previewSessions", () => {
  // 2026-10-12 es lunes.
  it("genera una salida por día y hora en los días de la regla", () => {
    const sessions = previewSessions([rule({ weekdays: [1, 3], times: ["17:30", "09:00"] })], "2026-10-12", 7);
    expect(sessions).toEqual([
      { date: "2026-10-12", time: "09:00", language: "es" },
      { date: "2026-10-12", time: "17:30", language: "es" },
      { date: "2026-10-14", time: "09:00", language: "es" },
      { date: "2026-10-14", time: "17:30", language: "es" },
    ]);
  });

  it("respeta la temporada, con Desde y Hasta incluidos", () => {
    const sessions = previewSessions([rule({ validFrom: "2026-10-13", validTo: "2026-10-14" })], "2026-10-12", 7);
    expect(sessions.map((session) => session.date)).toEqual(["2026-10-13", "2026-10-14"]);
  });

  it("dos reglas a la misma hora cuentan como una salida (gana la primera)", () => {
    const sessions = previewSessions([rule({ language: "es" }), rule({ language: "en" })], "2026-10-12", 1);
    expect(sessions).toEqual([{ date: "2026-10-12", time: "10:00", language: "es" }]);
  });

  it("cruza el cambio de hora de octubre sin saltarse ni repetir días", () => {
    // El 25 de octubre de 2026 Canarias pasa de UTC+1 a UTC+0.
    const sessions = previewSessions([rule({})], "2026-10-24", 3);
    expect(sessions.map((session) => session.date)).toEqual(["2026-10-24", "2026-10-25", "2026-10-26"]);
  });

  it("sin reglas no hay salidas", () => {
    expect(previewSessions([], "2026-10-12", 14)).toEqual([]);
  });
});

describe("shortDateLabel", () => {
  it("muestra día y mes abreviado en español", () => {
    expect(shortDateLabel("2026-10-12")).toBe("12 oct");
    expect(shortDateLabel("2026-01-03")).toBe("3 ene");
  });
});
