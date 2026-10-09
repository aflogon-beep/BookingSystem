import { expect, test as setup } from "@playwright/test";

import { E2E_PASSWORD, E2E_USERS, ensureE2EUsers } from "./users";

setup("crea usuarios de prueba e inicia sesión como admin", async ({ page }) => {
  await ensureE2EUsers();

  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_USERS.admin.email);
  await page.getByLabel("Contraseña").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/panel$/);

  await page.context().storageState({ path: "playwright/.auth/admin.json" });
});
