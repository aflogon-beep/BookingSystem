import { expect, test } from "@playwright/test";

// La web pública no necesita sesión.
test.use({ storageState: { cookies: [], origins: [] } });

test("del listado a la ficha: día, horario y entradas", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page).toHaveTitle("Experiencias en Tenerife · Volcán Tours");
  await expect(page.getByRole("heading", { level: 1, name: "Experiencias en Tenerife" })).toBeVisible();

  const card = page.getByRole("link", { name: /Teide al atardecer y estrellas/ });
  await expect(card).toContainText(/Desde\s45\s€/);
  await card.click();

  await expect(page).toHaveURL(/\/experiencias\/teide-atardecer-estrellas$/);
  await expect(page.getByRole("heading", { level: 1, name: "Teide al atardecer y estrellas" })).toBeVisible();
  await expect(page.getByText("Plaza del Cristo, La Laguna")).toBeVisible();

  // El Teide sale todos los días a las 16:30: el primer día con plazas.
  const booking = page.getByRole("complementary", { name: "Reservar" });
  await booking.getByRole("link", { name: /, desde 45\s€$/ }).first().click();
  await expect(page).toHaveURL(/fecha=\d{4}-\d{2}-\d{2}/);
  await booking.getByRole("link", { name: /16:30/ }).click();
  await expect(booking.getByRole("link", { name: /16:30/ })).toHaveAttribute("aria-current", "true");

  const continueButton = booking.getByRole("button", { name: "Continuar" });
  await expect(continueButton).toBeDisabled();
  await booking.getByRole("button", { name: "Añadir Adulto" }).click();
  await booking.getByRole("button", { name: "Añadir Adulto" }).click();
  await booking.getByRole("button", { name: "Añadir Niño" }).click();
  await expect(booking.getByText(/^183\s€$/)).toBeVisible();

  const salida = new URL(page.url()).searchParams.get("salida");
  const next = booking.getByRole("link", { name: "Continuar" });
  await expect(next).toHaveAttribute("href", new RegExp(`/experiencias/teide-atardecer-estrellas/reservar\\?salida=${salida}&entradas=`));
});

test("se puede cambiar de mes y no se vuelve a meses pasados", async ({ page }) => {
  await page.goto("/experiencias/teide-atardecer-estrellas?mes=2001-01");
  const booking = page.getByRole("complementary", { name: "Reservar" });
  await expect(booking.getByRole("link", { name: "Mes anterior" })).toHaveCount(0);
  const title = await booking.getByRole("heading", { level: 2 }).first().textContent();
  await booking.getByRole("link", { name: "Mes siguiente" }).click();
  await expect(page).toHaveURL(/mes=\d{4}-\d{2}/);
  await expect(booking.getByRole("heading", { level: 2 }).first()).not.toHaveText(title ?? "");
  await expect(booking.getByRole("link", { name: "Mes anterior" })).toBeVisible();
});

test("una experiencia que no existe da 404", async ({ page }) => {
  expect((await page.goto("/experiencias/no-existe"))?.status()).toBe(404);
  expect((await page.goto("/experiencias/Mal%20slug"))?.status()).toBe(404);
});
