import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("los textos legales se abren desde el pie de la web, en español e inglés", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Política de privacidad" }).click();
  await expect(page).toHaveURL(/\/legal\/privacidad$/);
  await expect(page.getByRole("heading", { level: 1, name: "Política de privacidad" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Tus derechos" })).toBeVisible();

  await page.goto("/en/legal/cookies");
  await expect(page.getByRole("heading", { level: 1, name: "Cookie policy" })).toBeVisible();

  const missing = await page.goto("/legal/otra");
  expect(missing?.status()).toBe(404);
});
