import { expect, test } from "@playwright/test";

test("el asistente valida cada paso y crea el primer tour con salidas", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "escritorio", "cambia datos: solo en escritorio");
  const name = `Tour asistente e2e ${Date.now()}`;
  const next = page.getByRole("button", { name: "Continuar" });

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
  await page.getByRole("switch", { name: "Vendo Residente canario" }).click();
  await next.click();

  // Equipo: sin añadir a nadie (ya hay guías).
  await expect(page.getByRole("heading", { level: 1, name: "Tu equipo" })).toBeVisible();
  await next.click();

  await expect(page.getByRole("heading", { level: 1, name: "Tu primer tour" })).toBeVisible();
  await next.click();
  await expect(page.getByRole("alert")).toHaveText("Ponle nombre al tour.");
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
});
