import { describe, expect, it } from "vitest";

import {
  autoAssignMessage,
  buildSlots,
  missingResources,
  optionLabel,
  resourceIdsAfterChange,
  slotWarning,
  type AssignableResource,
  type AssignmentContext,
} from "./assignment";

const ana: AssignableResource = { id: "ana", name: "Ana Pérez", type: "guide", seats: 1, languages: ["es", "en"] };
const lukas: AssignableResource = { id: "lukas", name: "Lukas Weber", type: "guide", seats: 1, languages: ["de"] };
const van: AssignableResource = { id: "van", name: "Furgoneta 08", type: "vehicle", seats: 8, languages: [] };
const scope: AssignableResource = { id: "scope", name: "Telescopio", type: "equipment", seats: 1, languages: [] };

const context = (busy: string[] = []): AssignmentContext => ({ language: "es", capacity: 12, busyIds: new Set(busy) });

describe("buildSlots", () => {
  it("crea un hueco por unidad que pide el producto, relleno con lo asignado", () => {
    expect(buildSlots({ guide: 2, vehicle: 1, equipment: 0 }, [van, ana])).toEqual([
      { key: "guide-0", type: "guide", label: "Guía 1", resourceId: "ana" },
      { key: "guide-1", type: "guide", label: "Guía 2", resourceId: null },
      { key: "vehicle-0", type: "vehicle", label: "Vehículo 1", resourceId: "van" },
    ]);
  });

  it("muestra lo asignado de más aunque el producto ya no lo pida", () => {
    const slots = buildSlots({ guide: 1, vehicle: 0, equipment: 0 }, [ana, lukas, scope]);
    expect(slots.map((slot) => slot.label)).toEqual(["Guía 1", "Guía 2", "Equipo 1"]);
  });

  it("sin necesidades ni asignaciones no hay huecos", () => {
    expect(buildSlots({ guide: 0, vehicle: 0, equipment: 0 }, [])).toEqual([]);
  });
});

describe("missingResources", () => {
  it("cuenta lo que falta tipo a tipo, sin compensar con lo que sobra", () => {
    expect(missingResources({ guide: 1, vehicle: 1, equipment: 1 }, [ana, lukas])).toBe(2);
    expect(missingResources({ guide: 1, vehicle: 0, equipment: 0 }, [ana])).toBe(0);
  });
});

describe("optionLabel y slotWarning", () => {
  it("un recurso que encaja no tiene aviso", () => {
    expect(optionLabel(ana, context())).toBe("Ana Pérez");
    expect(slotWarning(ana, context())).toBeNull();
  });

  it("avisa de un recurso ocupado a esa hora", () => {
    expect(optionLabel(ana, context(["ana"]))).toBe("Ana Pérez · ocupado");
    expect(slotWarning(ana, context(["ana"]))).toBe("Ya está en otra salida a esa hora");
  });

  it("avisa de un guía que no habla el idioma de la salida", () => {
    expect(optionLabel(lukas, context())).toBe("Lukas Weber · sin ES");
    expect(slotWarning(lukas, context())).toBe("No figura como guía en español");
  });

  it("avisa de un vehículo con menos asientos que plazas", () => {
    expect(optionLabel(van, context())).toBe("Furgoneta 08 · 8 plazas");
    expect(slotWarning(van, context())).toBe("8 asientos para 12 plazas");
    expect(slotWarning(van, { ...context(), capacity: 8 })).toBeNull();
  });

  it("el material no tiene idioma ni asientos que comprobar", () => {
    expect(optionLabel(scope, context())).toBe("Telescopio");
    expect(slotWarning(scope, context())).toBeNull();
  });
});

describe("resourceIdsAfterChange", () => {
  const slots = buildSlots({ guide: 2, vehicle: 1, equipment: 0 }, [ana, van]);

  it("cambia un hueco y devuelve todo el equipo sin huecos vacíos", () => {
    expect(resourceIdsAfterChange(slots, "guide-1", "lukas")).toEqual(["ana", "lukas", "van"]);
    expect(resourceIdsAfterChange(slots, "vehicle-0", null)).toEqual(["ana"]);
  });

  it("no repite un recurso elegido en dos huecos", () => {
    expect(resourceIdsAfterChange(slots, "guide-1", "ana")).toEqual(["ana", "van"]);
  });
});

describe("autoAssignMessage", () => {
  it("dice si se asignó todo o cuántos faltan", () => {
    expect(autoAssignMessage(0)).toEqual({ ok: true, text: "Equipo asignado" });
    expect(autoAssignMessage(1)).toEqual({ ok: false, text: "Falta 1 recurso libre o con ese idioma" });
    expect(autoAssignMessage(3)).toEqual({ ok: false, text: "Faltan 3 recursos libres o con ese idioma" });
  });
});
