import { expect, test, type Page } from "@playwright/test";

import { e2eAdminDb } from "./users";

// Los tests que cambian datos corren solo en escritorio (los proyectos van en paralelo contra la
// misma BD) y dejan los valores como estaban.
// Dentro del archivo, uno detrás de otro: el asistente reescribe idiomas y lee los tipos de entrada
// que cambian los otros tests.
test.describe.configure({ mode: "default" });

async function expectSaved(page: Page) {
  await expect(page.getByText("Ajustes guardados").first()).toBeVisible();
}

test("Ajustes abre Empresa con los datos del negocio y navega por las secciones", async ({ page }) => {
  await page.goto("/panel/ajustes");
  await expect(page).toHaveURL(/\/panel\/ajustes\/empresa$/);
  await expect(page.getByRole("heading", { level: 1, name: "Ajustes" })).toBeVisible();
  await expect(page.getByLabel("Nombre comercial")).not.toHaveValue("");
  await expect(page.getByRole("button", { name: "Español" })).toHaveAttribute("aria-pressed", "true");

  const secciones = page.getByRole("navigation", { name: "Secciones de ajustes" });
  await secciones.getByRole("link", { name: "Venta y cancelación" }).click();
  await expect(page).toHaveURL(/\/politicas$/);
  await expect(page.getByLabel("Cierre de venta online")).toBeVisible();
  await expect(secciones.getByRole("link", { name: "Venta y cancelación" })).toHaveAttribute("aria-current", "page");

  await secciones.getByRole("link", { name: "Tipos de entrada" }).click();
  await expect(page.getByRole("list", { name: "Tipos de entrada" }).getByRole("listitem").first()).toBeVisible();
});

test("un campo se guarda solo al salir de él y valida el valor", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "escritorio", "cambia datos: solo en escritorio");
  await page.goto("/panel/ajustes/politicas");

  const cancel = page.getByLabel("Cancelación gratuita");
  const original = await cancel.inputValue();
  await cancel.fill("48");
  await cancel.blur();
  await expectSaved(page);
  await page.reload();
  await expect(page.getByLabel("Cancelación gratuita")).toHaveValue("48");

  await page.getByLabel("Cancelación gratuita").fill("");
  await page.getByLabel("Cancelación gratuita").blur();
  await expect(page.getByText("Cancelación gratuita: escribe un número.").first()).toBeVisible();

  await page.getByLabel("Cancelación gratuita").fill(original);
  await page.getByLabel("Cancelación gratuita").blur();
  await expectSaved(page);
});

test("los idiomas se activan y no se quita uno que usan los horarios", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "escritorio", "cambia datos: solo en escritorio");
  await page.goto("/panel/ajustes/empresa");

  const frances = page.getByRole("button", { name: "Francés" });
  await expect(frances).toHaveAttribute("aria-pressed", "false");
  await frances.click();
  await expect(frances).toHaveAttribute("aria-pressed", "true");
  await frances.click();
  await expect(frances).toHaveAttribute("aria-pressed", "false");

  // El seed tiene horarios en alemán.
  await page.getByRole("button", { name: "Alemán" }).click();
  await expect(page.getByText(/Hay horarios en alemán/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Alemán" })).toHaveAttribute("aria-pressed", "true");
});

test("tipos de entrada: añadir, renombrar y eliminar con confirmación", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "escritorio", "cambia datos: solo en escritorio");
  await page.goto("/panel/ajustes/entradas");
  const list = page.getByRole("list", { name: "Tipos de entrada" });
  const before = await list.getByRole("listitem").count();

  await page.getByRole("button", { name: "Añadir" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(before + 1);
  const name = list.getByRole("listitem").last().getByLabel("Nombre", { exact: true });
  await expect(name).toBeFocused();
  await name.fill("Senior e2e");
  await name.press("Enter");
  await expectSaved(page);
  const nameEn = list.getByRole("listitem").last().getByLabel("Nombre en inglés");
  await nameEn.fill("Senior");
  // Ya hay un aviso de «Ajustes guardados» en pantalla: se espera a la respuesta de la acción.
  const saved = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.request().headers()["next-action"] !== undefined,
  );
  await nameEn.press("Enter");
  await saved;

  await page.reload();
  const row = page.getByRole("list", { name: "Tipos de entrada" }).getByRole("listitem").last();
  await expect(row.getByLabel("Nombre", { exact: true })).toHaveValue("Senior e2e");
  await expect(row.getByLabel("Nombre en inglés")).toHaveValue("Senior");

  await row.getByRole("button", { name: "Eliminar Senior e2e" }).click();
  const dialog = page.getByRole("dialog", { name: "¿Eliminar «Senior e2e»?" });
  await expect(dialog).toContainText("Ningún producto lo vende.");
  await dialog.getByRole("button", { name: "Eliminar" }).click();
  await expect(page.getByRole("list", { name: "Tipos de entrada" }).getByRole("listitem")).toHaveCount(before);
});

test("el asistente valida cada paso y crea el primer tour con salidas", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "escritorio", "cambia datos: solo en escritorio");
  const name = `Tour asistente e2e ${Date.now()}`;
  const next = page.getByRole("button", { name: "Continuar" });
  try {
    await page.goto("/panel/ajustes/empresa");
    await page.getByRole("link", { name: "Asistente" }).click();
    await expect(page).toHaveURL(/\/panel\/asistente$/);
    await expect(page.getByRole("heading", { level: 1, name: "Bienvenido a tu panel de reservas" })).toBeVisible();
    await next.click();

    // Negocio: parte de los ajustes actuales (se deja igual para no afectar a otros tests).
    await expect(page.getByRole("heading", { level: 1, name: "Tu negocio" })).toBeVisible();
    await expect(page.getByLabel("Nombre de tu empresa")).toHaveValue("Volcán Tours");
    await next.click();

    // Entradas: las que ya tiene el negocio.
    await expect(page.getByRole("heading", { level: 1, name: "¿Qué entradas vendes?" })).toBeVisible();
    // Solo Adulto, Niño y Bebé (por si otro test acaba de crear un tipo de entrada).
    const switches = page.getByRole("list", { name: "Tipos de entrada" }).getByRole("switch");
    for (const item of await switches.all()) {
      const label = (await item.getAttribute("aria-label")) ?? "";
      const wanted = ["Vendo Adulto", "Vendo Niño", "Vendo Bebé"].includes(label);
      if ((await item.getAttribute("aria-checked")) !== String(wanted)) await item.click();
    }
    await next.click();

    // Equipo: sin añadir a nadie (ya hay guías).
    await expect(page.getByRole("heading", { level: 1, name: "Tu equipo" })).toBeVisible();
    await next.click();

    await expect(page.getByRole("heading", { level: 1, name: "Tu primer tour" })).toBeVisible();
    await next.click();
    // (Next añade otro role=alert para anunciar la ruta.)
    await expect(page.getByRole("alert").filter({ hasText: "Ponle nombre al tour." })).toBeVisible();
    await page.getByLabel("Nombre del tour").fill(name);
    await page.getByLabel("Precio de Adulto").fill("30");
    await page.getByLabel("Precio de Niño").fill("15");
    await page.getByLabel("Precio de Bebé").fill("0");
    await expect(page.getByLabel("Precio de Residente canario")).toHaveCount(0);
    await page.getByLabel("Horas de salida").fill("6:15");
    await expect(page.getByText(/Esto genera \d+ salidas en las próximas dos semanas/)).toBeVisible();
    await next.click();

    await expect(page.getByRole("heading", { level: 1, name: "Todo listo" })).toBeVisible();
    await expect(page.getByText(name)).toBeVisible();
    await expect(page.getByText("Lun–Sáb · 06:15 · ES")).toBeVisible();
    await page.getByRole("button", { name: "Crear mi panel" }).click();
    await expect(page.getByText("Panel creado con tus primeras salidas")).toBeVisible();
    await expect(page).toHaveURL(/\/panel$/);

    // El tour queda creado con sus precios; se borra al terminar.
    await page.goto("/panel/productos");
    const card = page.getByRole("listitem", { name });
    await expect(card.getByText("Lun–Sáb · 06:15 · ES")).toBeVisible();
    await expect(card.getByText("desde 15 €")).toBeVisible();
    await card.getByRole("link", { name: `Editar ${name}` }).click();
    await page.getByRole("button", { name: "Eliminar" }).click();
    await page.getByRole("dialog", { name: `¿Eliminar «${name}»?` }).getByRole("button", { name: "Eliminar" }).click();
    await expect(page).toHaveURL(/\/panel\/productos$/);
    await expect(page.getByRole("listitem", { name })).toHaveCount(0);
  } finally {
    await e2eAdminDb().from("products").delete().eq("name", name);
  }
});
