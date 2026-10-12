import { expect, type Page, test } from "@playwright/test";
import { addDays, format, parseISO } from "date-fns";

import { businessToday } from "@/lib/domain/schedule";

// En móvil nada del panel puede salirse de la pantalla ni quedar cortado por su tarjeta.
// Se comprueba a 360 px (móviles pequeños) y a 390 px con el texto al 120 % (tamaño de letra
// grande del sistema, habitual en Android).
const WIDTHS = [
  { width: 360, fontScale: 1 },
  { width: 390, fontScale: 1.2 },
];

// Mañana siempre hay salidas (el Teide sale a diario), así se ven las tarjetas de «Salidas del día».
const TOMORROW = format(addDays(parseISO(businessToday()), 1), "yyyy-MM-dd");

const ROUTES = [
  "/panel",
  `/panel?fecha=${TOMORROW}`,
  "/panel/calendario",
  "/panel/calendario?vista=mes",
  "/panel/reservas",
  "/panel/reservas/nueva",
  "/panel/clientes",
  "/panel/equipo",
  "/panel/equipo?vista=fichas",
  "/panel/equipo?vista=fichas&tipo=vehiculos",
  "/panel/productos",
  "/panel/productos/nuevo",
  "/panel/informes",
  "/panel/avisos",
  "/panel/asistente",
  "/panel/ajustes",
  "/panel/ajustes/empresa",
  "/panel/ajustes/entradas",
  "/panel/ajustes/politicas",
  "/panel/ajustes/usuarios",
  // Ficha pública con galería, itinerario y barra fija de reservar.
  "/experiencias/teide-atardecer-estrellas",
  "/en/experiencias/teide-atardecer-estrellas",
];

// Fichas a las que se llega desde un listado: se abre la primera que haya.
const DETAILS = [
  { from: `/panel?fecha=${TOMORROW}`, link: /^\/panel\/salidas\/[0-9a-f-]{36}$/ },
  { from: "/panel/productos", link: /^\/panel\/productos\/[0-9a-f-]{36}$/ },
  { from: "/panel/reservas", link: /^\/panel\/reservas\/[A-Z0-9]+$/ },
  { from: "/panel/clientes", link: /^\/panel\/clientes\/[0-9a-f-]{36}$/ },
];

/** Elementos que se salen de la pantalla o de un contenedor que los recorta (sin scroll propio). */
async function overflowing(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const problems: string[] = [];
    if (document.documentElement.scrollWidth > viewport + 1) {
      problems.push(`la página se desplaza en horizontal (${document.documentElement.scrollWidth} px > ${viewport} px)`);
    }

    const describe = (el: Element) => {
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 50);
      const classes = el.getAttribute("class")?.split(/\s+/).slice(0, 8).join(" ") ?? "";
      const attrs = ["id", "type", "aria-label"].map((name) => (el.hasAttribute(name) ? ` ${name}="${el.getAttribute(name)}"` : "")).join("");
      return `<${el.tagName.toLowerCase()}${attrs} class="${classes}"> «${text}»`;
    };

    // Las tablas tienen scroll propio, pero en móvil no deben obligar a deslizar de lado.
    for (const table of document.body.querySelectorAll("table")) {
      const box = table.parentElement;
      // «data-scroll-x» marca las tablas que se deslizan a propósito (la planificación semanal).
      if (box?.closest("[data-scroll-x]")) continue;
      if (box && table.getBoundingClientRect().width > 1 && table.scrollWidth > box.clientWidth + 1) {
        problems.push(`${describe(table)} obliga a deslizar de lado (${table.scrollWidth} px > ${box.clientWidth} px)`);
      }
    }

    const flagged = new Set<Element>();
    for (const el of document.body.querySelectorAll("*")) {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) continue; // oculto o «sr-only»
      if (el instanceof SVGElement && !(el instanceof SVGSVGElement)) continue; // el dibujo de un icono
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "contents") continue;

      // Primer antepasado que recorta en horizontal.
      let clipper = el.parentElement;
      while (clipper && clipper !== document.body && getComputedStyle(clipper).overflowX === "visible") {
        clipper = clipper.parentElement;
      }
      let left = 0;
      let right = viewport;
      if (clipper && clipper !== document.body) {
        const clipStyle = getComputedStyle(clipper);
        // Un carrusel con scroll horizontal o un texto con puntos suspensivos son intencionados.
        if (clipStyle.overflowX === "auto" || clipStyle.overflowX === "scroll") continue;
        if (clipStyle.textOverflow === "ellipsis") continue;
        const clipRect = clipper.getBoundingClientRect();
        if (clipRect.width <= 1 || clipRect.height <= 1) continue; // dentro de un «sr-only»: solo para lectores de pantalla
        left = Math.max(0, clipRect.left);
        right = Math.min(viewport, clipRect.right);
      }
      if (rect.right <= right + 1 && rect.left >= left - 1) continue;

      let ancestor = el.parentElement;
      while (ancestor && !flagged.has(ancestor)) ancestor = ancestor.parentElement;
      flagged.add(el);
      if (!ancestor) problems.push(`${describe(el)} (${Math.round(rect.left)}–${Math.round(rect.right)} px, cabe en ${Math.round(left)}–${Math.round(right)} px)`);
    }
    return problems;
  });
}

async function check(page: Page, url: string) {
  for (const { width, fontScale } of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(url);
    await page.waitForLoadState("load");
    if (fontScale !== 1) await page.addStyleTag({ content: `html { font-size: ${fontScale * 100}% !important; }` });
    const problems = await overflowing(page);
    expect.soft(problems, `${url} a ${width} px (texto ${fontScale * 100} %)`).toEqual([]);
  }
}

test.describe("panel sin desbordes en móvil", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "movil", "solo en móvil");
  });

  for (const route of ROUTES) {
    test(route, async ({ page }) => {
      await check(page, route);
    });
  }

  for (const { from, link } of DETAILS) {
    test(`ficha desde ${from}`, async ({ page }) => {
      await page.goto(from);
      const hrefs = await page.locator("a[href]").evaluateAll((els) => els.map((el) => el.getAttribute("href") ?? ""));
      const href = hrefs.find((value) => link.test(value));
      test.skip(!href, "no hay ninguna ficha que abrir");
      await check(page, href!);
    });
  }

  test("pestañas de la ficha de producto", async ({ page }) => {
    await page.goto("/panel/productos");
    const hrefs = await page.locator("a[href]").evaluateAll((els) => els.map((el) => el.getAttribute("href") ?? ""));
    const href = hrefs.find((value) => /^\/panel\/productos\/[0-9a-f-]{36}$/.test(value));
    test.skip(!href, "no hay productos");
    for (const { width, fontScale } of WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(href!);
      if (fontScale !== 1) await page.addStyleTag({ content: `html { font-size: ${fontScale * 100}% !important; }` });
      for (const tab of ["Fotos", "Ficha web", "Entradas y precios", "Horarios", "Equipo"]) {
        await page.getByRole("tab", { name: tab }).click();
        const problems = await overflowing(page);
        expect.soft(problems, `${href} pestaña ${tab} a ${width} px`).toEqual([]);
      }
    }
  });
});
