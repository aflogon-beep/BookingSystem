import { expect, test } from "@playwright/test";

test.describe("navegación del panel", () => {
  test("escritorio: la navegación principal lleva a cada sección y marca la activa", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "escritorio", "solo en escritorio");
    await page.goto("/panel");

    const principal = page.getByRole("navigation", { name: "Principal" });
    await expect(principal).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Pestañas" })).toBeHidden();
    await expect(principal.getByRole("link", { name: "Hoy" })).toHaveAttribute("aria-current", "page");

    await principal.getByRole("link", { name: "Calendario" }).click();
    await expect(page).toHaveURL(/\/panel\/calendario$/);
    await expect(page.getByRole("heading", { level: 1, name: "Calendario" })).toBeVisible();
    await expect(principal.getByRole("link", { name: "Calendario" })).toHaveAttribute("aria-current", "page");
    await expect(principal.getByRole("link", { name: "Hoy" })).not.toHaveAttribute("aria-current", "page");

    await page.getByRole("link", { name: "Ajustes" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Ajustes" })).toBeVisible();
  });

  test("tablet: la navegación pasa a una segunda fila con todas las secciones", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "tablet", "solo en tablet");
    await page.goto("/panel/clientes");

    const secciones = page.getByRole("navigation", { name: "Secciones" });
    await expect(secciones).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Principal" })).toBeHidden();
    await expect(page.getByRole("navigation", { name: "Pestañas" })).toBeHidden();
    await expect(secciones.getByRole("link", { name: "Clientes" })).toHaveAttribute("aria-current", "page");

    await secciones.getByRole("link", { name: "Informes" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Informes" })).toBeVisible();
    await expect(secciones.getByRole("link", { name: "Informes" })).toHaveAttribute("aria-current", "page");
  });

  test("móvil: la barra de pestañas navega y «Más» abre el resto de secciones", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "movil", "solo en móvil");
    await page.goto("/panel");

    const pestanas = page.getByRole("navigation", { name: "Pestañas" });
    await expect(pestanas).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Principal" })).toBeHidden();

    await pestanas.getByRole("link", { name: "Reservas" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Reservas" })).toBeVisible();
    await expect(pestanas.getByRole("link", { name: "Reservas" })).toHaveAttribute("aria-current", "page");

    await pestanas.getByRole("button", { name: "Más" }).click();
    const mas = page.getByRole("dialog", { name: "Más secciones" });
    await expect(mas).toBeVisible();
    await mas.getByRole("link", { name: "Productos" }).click();
    await expect(mas).toBeHidden();
    await expect(page.getByRole("heading", { level: 1, name: "Productos" })).toBeVisible();

    await expect(pestanas.getByRole("button", { name: "Más" })).toHaveAttribute("aria-current", "page");

    await pestanas.getByRole("link", { name: "Nueva reserva" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Nueva reserva" })).toBeVisible();
  });

  test("ninguna sección desborda en horizontal", async ({ page }) => {
    for (const path of ["/panel", "/panel/calendario", "/panel/ajustes"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});
