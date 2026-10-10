import { describe, expect, it } from "vitest";

import {
  assignPendingMessage,
  isPast,
  minutesInDay,
  resourceStatus,
  sessionPlace,
  timelineHours,
  timelinePercent,
  weeklyPlan,
  whereaboutsKpis,
  type DaySession,
} from "./whereabouts";

// En diciembre Canarias está en UTC+0: la hora del negocio coincide con la UTC.
const DAY = "2030-12-02";

function session(id: string, start: string, end: string, extra: Partial<DaySession> = {}): DaySession {
  return {
    id,
    productName: "Teide al atardecer",
    color: "#0A84FF",
    place: "Parque Nacional del Teide",
    meetingPoint: "Plaza del Cristo",
    language: "es",
    startsAt: `${DAY}T${start}:00Z`,
    endsAt: `${DAY}T${end}:00Z`,
    start,
    end,
    booked: 4,
    missing: 0,
    resourceIds: ["ana"],
    ...extra,
  };
}

const morning = session("m", "09:00", "12:00");
const evening = session("e", "16:30", "21:30");
const at = (time: string) => new Date(`${DAY}T${time}:00Z`);

describe("sessionPlace", () => {
  it("usa la zona, si no el punto de encuentro, si no el producto", () => {
    expect(sessionPlace({ name: "Tour", place: "Anaga", meetingPoint: "Cruz del Carmen" })).toBe("Anaga");
    expect(sessionPlace({ name: "Tour", place: " ", meetingPoint: "Cruz del Carmen" })).toBe("Cruz del Carmen");
    expect(sessionPlace({ name: "Tour", place: "", meetingPoint: "" })).toBe("Tour");
  });
});

describe("resourceStatus", () => {
  const sessions = [evening, morning];

  it("sin salidas está libre todo el día", () => {
    expect(resourceStatus("lukas", sessions, true, at("10:00"))).toMatchObject({
      level: "idle",
      title: "Libre todo el día",
      sessions: [],
    });
  });

  it("otro día solo cuenta las salidas y dice la primera", () => {
    expect(resourceStatus("ana", sessions, false, at("10:00"))).toMatchObject({
      level: "idle",
      title: "2 salidas",
      sub: "Primera a las 09:00 · Parque Nacional del Teide",
    });
  });

  it("hoy, durante una salida, está en ruta y dice cuándo vuelve", () => {
    expect(resourceStatus("ana", sessions, true, at("10:00"))).toMatchObject({
      level: "live",
      title: "En ruta · Parque Nacional del Teide",
      sub: "Teide al atardecer · vuelve a las 12:00",
      currentId: "m",
    });
  });

  it("si sale en una hora o menos, avisa; si no, libre hasta la próxima", () => {
    expect(resourceStatus("ana", sessions, true, at("15:45"))).toMatchObject({ level: "soon", title: "Sale en 45 min" });
    expect(resourceStatus("ana", sessions, true, at("13:00"))).toMatchObject({
      level: "free",
      title: "Libre · próxima a las 16:30",
      sub: "Teide al atardecer · ES · Plaza del Cristo",
    });
  });

  it("después de la última salida, jornada terminada", () => {
    expect(resourceStatus("ana", sessions, true, at("22:00"))).toMatchObject({ level: "done", sub: "2 salidas hoy" });
  });

  it("ordena sus salidas por hora", () => {
    expect(resourceStatus("ana", sessions, false, at("10:00")).sessions.map((item) => item.id)).toEqual(["m", "e"]);
  });
});

describe("línea de tiempo", () => {
  it("cuenta minutos del día y recorta lo que pasa de medianoche", () => {
    expect(minutesInDay(`${DAY}T16:30:00Z`, DAY)).toBe(990);
    expect(minutesInDay("2030-12-03T01:00:00Z", DAY)).toBe(1440);
    expect(minutesInDay("2030-12-01T23:00:00Z", DAY)).toBe(0);
  });

  it("en verano usa la hora de Canarias (UTC+1)", () => {
    expect(minutesInDay("2030-07-01T08:00:00Z", "2030-07-01")).toBe(540);
    // 23:30 UTC del día 1 ya es la 00:30 del día 2 en Canarias.
    expect(minutesInDay("2030-07-01T23:30:00Z", "2030-07-01")).toBe(1440);
    expect(minutesInDay("2030-07-01T23:30:00Z", "2030-07-02")).toBe(30);
  });

  it("va de 8 a 22 y se amplía con salidas más tempranas o tardías", () => {
    expect(timelineHours([morning, evening], DAY)).toEqual({ from: 8, to: 22 });
    expect(timelineHours([session("x", "06:30", "08:00"), session("y", "21:00", "23:15")], DAY)).toEqual({ from: 6, to: 24 });
  });

  it("coloca en porcentaje y no se sale de la línea", () => {
    const hours = { from: 8, to: 22 };
    expect(timelinePercent(8 * 60, hours)).toBe(0);
    expect(timelinePercent(15 * 60, hours)).toBe(50);
    expect(timelinePercent(23 * 60, hours)).toBe(100);
    expect(timelinePercent(0, hours)).toBe(0);
  });

  it("una salida que ya terminó es pasada", () => {
    expect(isPast(morning, at("12:00"))).toBe(true);
    expect(isPast(morning, at("11:59"))).toBe(false);
  });
});

describe("whereaboutsKpis", () => {
  it("cuenta estados y salidas con reservas sin equipo", () => {
    const now = at("10:00");
    const statuses = ["ana", "lukas"].map((id) => resourceStatus(id, [morning], true, now));
    const sessions = [morning, session("x", "11:00", "13:00", { missing: 1 }), session("y", "14:00", "15:00", { missing: 2, booked: 0 })];
    expect(whereaboutsKpis(statuses, sessions)).toEqual({ live: 1, soon: 0, available: 1, total: 2, withoutEquipment: 1 });
  });
});

describe("assignPendingMessage", () => {
  it("dice qué hizo «Asignar pendientes»", () => {
    expect(assignPendingMessage({ sessions: 0, missing: 0 })).toEqual({ level: "ok", text: "No había salidas pendientes" });
    expect(assignPendingMessage({ sessions: 2, missing: 0 })).toEqual({ level: "ok", text: "2 salidas con equipo asignado" });
    expect(assignPendingMessage({ sessions: 1, missing: 1 })).toEqual({
      level: "warn",
      text: "Asignado. Falta 1 recurso libre o con ese idioma",
    });
  });
});

describe("weeklyPlan", () => {
  it("reparte las salidas de cada guía por día, por hora, con el total", () => {
    const plan = { language: "es", productName: "Teide", color: "#0A84FF" };
    const sessions = [
      { ...plan, id: "b", date: "2030-12-02", start: "16:30", resourceIds: ["ana"] },
      { ...plan, id: "a", date: "2030-12-02", start: "09:00", resourceIds: ["ana", "van"] },
      { ...plan, id: "c", date: "2030-12-04", start: "09:00", resourceIds: ["lukas"] },
    ];
    const rows = weeklyPlan([{ id: "ana" }, { id: "lukas" }], sessions, ["2030-12-02", "2030-12-03", "2030-12-04"]);
    expect(rows.map((row) => [row.guide.id, row.days.map((day) => day.map((item) => item.id)), row.total])).toEqual([
      ["ana", [["a", "b"], [], []], 2],
      ["lukas", [[], [], ["c"]], 1],
    ]);
  });
});
