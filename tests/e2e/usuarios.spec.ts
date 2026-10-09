import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { E2E_USERS } from "./users";

const NEW_PASSWORD = "Bienvenida2026";

test("el admin se ve a sí mismo sin poder cambiarse el rol ni darse de baja", async ({ page }) => {
  await page.goto("/panel/ajustes/usuarios");
  const list = page.getByRole("list", { name: "Usuarios del panel" });
  const self = list.getByRole("listitem").filter({ hasText: E2E_USERS.admin.email });
  await expect(self).toContainText("Tú");
  await expect(self.getByLabel(`Rol de ${E2E_USERS.admin.name}`)).toBeDisabled();
  await expect(self.getByRole("button", { name: /Dar de baja/ })).toHaveCount(0);
  await expect(list.getByRole("listitem").filter({ hasText: E2E_USERS.staff.email })).toBeVisible();
});

test("invitar, aceptar la invitación, cambiar el rol y dar de baja", async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== "escritorio", "cambia datos: solo en escritorio");
  const name = `Invitado ${randomUUID().slice(0, 8)}`;
  const email = `e2e-invitado-${randomUUID()}@example.test`;

  await page.goto("/panel/ajustes/usuarios");
  await page.getByRole("button", { name: "Invitar" }).click();
  const dialog = page.getByRole("dialog", { name: "Invitar al panel" });
  await dialog.getByLabel("Nombre").fill(name);
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByLabel("Rol").selectOption("staff");
  await dialog.getByRole("button", { name: "Crear invitación" }).click();

  const created = page.getByRole("dialog", { name: "Invitación creada" });
  const url = await created.getByLabel(/Enlace de invitación/).inputValue();
  expect(url).toMatch(/\/invitacion\?token=[0-9a-f]+$/);
  await created.getByRole("button", { name: "Hecho" }).click();

  const row = page.getByRole("list", { name: "Usuarios del panel" }).getByRole("listitem").filter({ hasText: email });
  await expect(row).toContainText("Invitación pendiente");

  // La persona invitada abre el enlace en su propio navegador.
  const guest = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const guestPage = await guest.newPage();
  await guestPage.goto(url);
  await guestPage.getByLabel("Contraseña", { exact: true }).fill(NEW_PASSWORD);
  await guestPage.getByLabel("Repite la contraseña").fill("Otra2026abcd");
  await guestPage.getByRole("button", { name: "Guardar y entrar" }).click();
  await expect(guestPage.locator("#invite-error")).toContainText("no coinciden");

  await guestPage.getByLabel("Contraseña", { exact: true }).fill(NEW_PASSWORD);
  await guestPage.getByLabel("Repite la contraseña").fill(NEW_PASSWORD);
  await guestPage.getByRole("button", { name: "Guardar y entrar" }).click();
  await expect(guestPage).toHaveURL(/\/panel$/);

  // El enlace solo sirve una vez.
  const reuse = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const reusePage = await reuse.newPage();
  await reusePage.goto(url);
  await reusePage.getByLabel("Contraseña", { exact: true }).fill(NEW_PASSWORD);
  await reusePage.getByLabel("Repite la contraseña").fill(NEW_PASSWORD);
  await reusePage.getByRole("button", { name: "Guardar y entrar" }).click();
  await expect(reusePage.locator("#invite-error")).toContainText("no es válido");
  await reuse.close();

  await page.reload();
  await expect(row).not.toContainText("Invitación pendiente");

  await row.getByLabel(`Rol de ${name}`).selectOption("admin");
  await expect(page.getByText(`${name} ahora es administrador`)).toBeVisible();

  await row.getByRole("button", { name: `Dar de baja a ${name}` }).click();
  await page.getByRole("dialog", { name: `¿Dar de baja a ${name}?` }).getByRole("button", { name: "Dar de baja" }).click();
  await expect(row).toHaveCount(0);

  // Sin fila en staff, la persona dada de baja ya no entra al panel.
  await guestPage.goto("/panel");
  await expect(guestPage).toHaveURL(/\/login/);
  await guest.close();
});

test("un enlace de invitación mal formado avisa sin mostrar el formulario", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/invitacion?token=nada");
  await expect(page.getByText("Este enlace de invitación no es válido")).toBeVisible();
  await expect(page.getByLabel("Repite la contraseña")).toHaveCount(0);
  await context.close();
});
