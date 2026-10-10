import { expect, test } from "@playwright/test";

test("la campana abre los avisos de las próximas 48 horas", async ({ page }) => {
  await page.goto("/panel");
  await page.getByRole("banner").getByRole("link", { name: /^Avisos/ }).click();
  await expect(page).toHaveURL(/\/panel\/avisos$/);
  await expect(page.getByRole("heading", { level: 1, name: "Avisos" })).toBeVisible();
  await expect(page.getByText("Salidas de las próximas 48 horas sin equipo asignado")).toBeVisible();
});
