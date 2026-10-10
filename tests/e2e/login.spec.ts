import { expect, test, type Page } from "@playwright/test";

import { E2E_PASSWORD, E2E_USERS } from "./users";

// Estos tests empiezan sin sesión.
test.use({ storageState: { cookies: [], origins: [] } });

async function login(page: Page, email: string, password = E2E_PASSWORD) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

test("sin sesión, el panel lleva al login y tras entrar vuelve a la página pedida", async ({ page }) => {
  await page.goto("/panel/reservas");
  await expect(page).toHaveURL(/\/login\?next=%2Fpanel%2Freservas$/);

  await login(page, E2E_USERS.admin.email);
  await expect(page).toHaveURL(/\/panel\/reservas$/);
  await expect(page.getByRole("heading", { level: 1, name: "Reservas" })).toBeVisible();
});

test("con una contraseña incorrecta muestra un error genérico", async ({ page }) => {
  await page.goto("/login");
  await login(page, E2E_USERS.admin.email, "Incorrecta2026");
  await expect(page.locator("#login-error")).toHaveText("Email o contraseña incorrectos.");
  await expect(page).toHaveURL(/\/login/);
});

test("una cuenta sin fila en staff no entra al panel", async ({ page }) => {
  await page.goto("/login");
  await login(page, E2E_USERS.outsider.email);
  await expect(page.locator("#login-error")).toContainText("no tiene acceso al panel");
  await page.goto("/panel");
  await expect(page).toHaveURL(/\/login/);
});

test("el rol staff no ve Ajustes ni Informes ni puede abrirlos", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "escritorio", "solo en escritorio");
  await page.goto("/login");
  await login(page, E2E_USERS.staff.email);
  await expect(page).toHaveURL(/\/panel$/);
  await expect(page.getByRole("link", { name: "Ajustes" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Informes" })).toHaveCount(0);

  await page.goto("/panel/ajustes");
  await expect(page).toHaveURL(/\/panel$/);
  await page.goto("/panel/asistente");
  await expect(page).toHaveURL(/\/panel$/);
  await page.goto("/panel/informes");
  await expect(page).toHaveURL(/\/panel$/);
});

test("Salir cierra la sesión", async ({ page }, testInfo) => {
  await page.goto("/login");
  await login(page, E2E_USERS.staff.email);
  await expect(page).toHaveURL(/\/panel$/);

  if (testInfo.project.name === "movil") {
    await page.getByRole("navigation", { name: "Pestañas" }).getByRole("button", { name: "Más" }).click();
    await page.getByRole("dialog", { name: "Más secciones" }).getByRole("button", { name: /Salir/ }).click();
  } else {
    await page.getByRole("button", { name: "Salir" }).click();
  }
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/panel");
  await expect(page).toHaveURL(/\/login\?next=%2Fpanel$/);
});
