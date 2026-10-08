import { expect, test } from "@playwright/test";

test("la portada carga en español con el nombre del negocio", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Ruta Reservas");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.getByRole("heading", { level: 1, name: "Ruta Reservas" })).toBeVisible();
});
