import { describe, expect, it } from "vitest";

import { PANEL_NAV, TAB_BAR_IDS, isNavItemActive, isMoreActive, navItem } from "@/lib/panel-nav";

describe("isNavItemActive", () => {
  it("marca Hoy solo en la raíz del panel", () => {
    expect(isNavItemActive(navItem("hoy"), "/panel")).toBe(true);
    expect(isNavItemActive(navItem("hoy"), "/panel/")).toBe(true);
    expect(isNavItemActive(navItem("hoy"), "/panel/calendario")).toBe(false);
  });

  it("marca la sección también en sus subrutas", () => {
    expect(isNavItemActive(navItem("reservas"), "/panel/reservas")).toBe(true);
    expect(isNavItemActive(navItem("reservas"), "/panel/reservas/VT1234")).toBe(true);
  });

  it("no confunde secciones con el mismo prefijo de texto", () => {
    expect(isNavItemActive(navItem("reservas"), "/panel/reservasx")).toBe(false);
  });

  it("mantiene Calendario activo dentro del manifiesto, como el prototipo", () => {
    expect(isNavItemActive(navItem("calendario"), "/panel/manifiesto/abc")).toBe(true);
  });
});

describe("isMoreActive", () => {
  it("se activa en secciones que no están en la barra de pestañas", () => {
    expect(isMoreActive("/panel/clientes")).toBe(true);
    expect(isMoreActive("/panel/ajustes")).toBe(true);
  });

  it("no se activa en las secciones de la barra de pestañas", () => {
    expect(isMoreActive("/panel")).toBe(false);
    expect(isMoreActive("/panel/calendario")).toBe(false);
    expect(isMoreActive("/panel/reservas")).toBe(false);
  });
});

describe("PANEL_NAV", () => {
  it("tiene identificadores únicos y rutas bajo /panel", () => {
    const ids = PANEL_NAV.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of PANEL_NAV) {
      expect(item.href.startsWith("/panel")).toBe(true);
    }
  });

  it("la barra de pestañas solo usa secciones existentes", () => {
    for (const id of TAB_BAR_IDS) {
      expect(() => navItem(id)).not.toThrow();
    }
  });
});
