import { describe, expect, it } from "vitest";

import { blockedReason, blockedText, sessionState, webSalesOpen } from "./session-state";

const base = { status: "open", started: false, ended: false, capacity: 16, booked: 0, blockingNeed: null, webOpen: true };

describe("estado de una salida", () => {
  it("con plazas: «N libres», reservable en el panel y en la web", () => {
    expect(sessionState(base)).toMatchObject({ kind: "available", label: "16 libres", tone: "normal", panelBookable: true, webBookable: true });
  });

  it("quedan pocas: «Quedan N» en naranja, solo si ya hay reservas", () => {
    expect(sessionState({ ...base, booked: 14 })).toMatchObject({ kind: "few", label: "Quedan 2", tone: "warn", panelBookable: true });
    expect(sessionState({ ...base, capacity: 3 })).toMatchObject({ kind: "available", label: "3 libres" });
  });

  it("completa: en azul y sin reservar", () => {
    expect(sessionState({ ...base, booked: 16 })).toMatchObject({ kind: "full", label: "Completa", tone: "blue", panelBookable: false, webBookable: false });
    expect(sessionState({ ...base, booked: 18 }).free).toBe(0);
  });

  it("sin su recurso obligatorio libre: «Sin guía libre» en naranja y sin reservar", () => {
    expect(blockedText("guide")).toBe("Sin guía libre");
    expect(blockedText("vehicle")).toBe("Sin vehículo libre");
    expect(sessionState({ ...base, blockingNeed: "guide" })).toMatchObject({
      kind: "blocked",
      label: "Sin guía libre",
      tone: "warn",
      panelBookable: false,
      webBookable: false,
    });
  });

  it("cerrada, cancelada, en ruta y ya salió: en gris y sin reservar", () => {
    expect(sessionState({ ...base, status: "closed" })).toMatchObject({ kind: "closed", label: "Cerrada", tone: "muted", panelBookable: false });
    expect(sessionState({ ...base, status: "cancelled" })).toMatchObject({ kind: "cancelled", label: "Cancelada", tone: "muted" });
    expect(sessionState({ ...base, started: true })).toMatchObject({ kind: "in_progress", label: "En ruta", panelBookable: false });
    expect(sessionState({ ...base, started: true, ended: true })).toMatchObject({ kind: "departed", label: "Ya salió" });
    expect(sessionState({ ...base, started: true, ended: undefined })).toMatchObject({ kind: "departed", label: "Ya salió" });
  });

  it("fuera de la venta online: el panel sí puede reservar", () => {
    expect(sessionState({ ...base, webOpen: false })).toMatchObject({
      kind: "panel_only",
      label: "16 libres · solo panel",
      panelBookable: true,
      webBookable: false,
    });
    expect(sessionState({ ...base, booked: 15, webOpen: false })).toMatchObject({ kind: "few", label: "Quedan 1 · solo panel", webBookable: false });
    expect(sessionState({ ...base, webOpen: undefined }).webBookable).toBe(true);
  });

  it("con varios motivos gana cancelada > ya salió > cerrada > sin recurso > completa", () => {
    const all = { ...base, status: "cancelled", started: true, booked: 16, blockingNeed: "guide" as const, webOpen: false };
    expect(sessionState(all).kind).toBe("cancelled");
    expect(sessionState({ ...all, status: "closed" }).kind).toBe("in_progress");
    expect(sessionState({ ...all, status: "closed", started: false }).kind).toBe("closed");
    expect(sessionState({ ...all, status: "open", started: false }).kind).toBe("blocked");
    expect(sessionState({ ...all, status: "open", started: false, blockingNeed: null }).kind).toBe("full");
  });
});

describe("venta online abierta", () => {
  const now = new Date("2026-10-10T10:00:00Z");
  it("solo productos a la venta y salidas después del cierre de venta", () => {
    expect(webSalesOpen("2026-10-10T13:00:00Z", true, 2, now)).toBe(true);
    expect(webSalesOpen("2026-10-10T12:00:00Z", true, 2, now)).toBe(true);
    expect(webSalesOpen("2026-10-10T11:59:00Z", true, 2, now)).toBe(false);
    expect(webSalesOpen("2026-10-10T13:00:00Z", false, 2, now)).toBe(false);
  });
});

describe("motivo de «Sin guía libre»", () => {
  it("dice quién ocupa el recurso y dónde", () => {
    const busy = [{ name: "Lukas", productName: "Ruta de senderismo", time: "09:00", endTime: "11:00" }];
    expect(blockedReason("guide", busy, "Alemán")).toBe("Lukas está en Ruta de senderismo de 09:00 a 11:00.");
  });

  it("si nadie lo ocupa, es que ningún guía habla el idioma", () => {
    expect(blockedReason("guide", [], "Alemán")).toBe("Ningún guía libre habla alemán.");
    expect(blockedReason("vehicle", [], "Alemán")).toBe("No queda ningún vehículo libre para esta salida.");
  });
});
