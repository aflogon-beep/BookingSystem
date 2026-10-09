import { expect, test } from "@playwright/test";
import { addDays, addWeeks, format, parseISO, startOfISOWeek } from "date-fns";

import { longDayLabel } from "@/lib/domain/calendar";
import { businessToday } from "@/lib/domain/schedule";

const PROJECT_WEEKS: Record<string, number> = { movil: 13, tablet: 14, escritorio: 15 };

// Un martes de dentro de 13-15 semanas, distinto por proyecto y de los días de los otros e2e.
// El Teide sale todos los días a las 16:30.
function tuesdayFor(project: string): string {
  const monday = startOfISOWeek(addWeeks(parseISO(businessToday()), PROJECT_WEEKS[project] ?? 13));
  return format(addDays(monday, 1), "yyyy-MM-dd");
}

// La web pública no necesita sesión.
test.use({ storageState: { cookies: [], origins: [] } });

test("del listado a la ficha: día, horario y entradas", async ({ page }, testInfo) => {
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

  const booking = page.getByRole("complementary", { name: "Reservar" });
  await expect(booking.getByRole("link", { name: /, desde 45\s€$/ }).first()).toBeVisible();

  // Un día concreto por URL: queda marcado en el calendario.
  const day = tuesdayFor(testInfo.project.name);
  await page.goto(`/experiencias/teide-atardecer-estrellas?fecha=${day}`);
  await expect(booking.locator('[aria-current="date"]')).toHaveAttribute("aria-label", new RegExp(`^${longDayLabel(day)},`));
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

  // Completar la reserva: sin pasarela, se paga el día de la excursión.
  await next.click();
  await expect(page.getByRole("heading", { level: 1, name: "Completa tu reserva" })).toBeVisible();
  const summary = page.getByRole("complementary", { name: "Tu reserva" });
  await expect(summary).toContainText("2 × Adulto");
  await expect(summary).toContainText(/183\s€/);
  const name = `Cliente web ${testInfo.project.name} ${Date.now()}`;
  await page.getByLabel("Nombre y apellidos").fill(name);
  await page.getByLabel("Email").fill(`web-${testInfo.project.name}-${Date.now()}@example.test`);
  await page.getByLabel("Hotel de recogida").fill("Hotel Mencey");
  await page.getByRole("button", { name: /^Confirmar reserva/ }).click();

  await expect(page.getByRole("heading", { level: 1, name: "¡Reserva confirmada!" })).toBeVisible();
  await expect(page).toHaveURL(/\/reserva\/VT[0-9A-Z]{6}$/);
  const ticket = page.getByRole("region", { name: "Tu reserva" });
  await expect(ticket).toContainText("Pagas allí");
  await expect(ticket).toContainText("Recogida en Hotel Mencey");
  await expect(ticket).toContainText("2 Adulto · 1 Niño");

  // Con el código solo, otro navegador no ve la reserva.
  const other = await page.context().browser()?.newContext();
  if (other) {
    const response = await (await other.newPage()).goto(page.url());
    expect(response?.status()).toBe(404);
    await other.close();
  }
});

test("sin plazas o con entradas raras, el pago no deja seguir", async ({ page }) => {
  await page.goto("/experiencias/teide-atardecer-estrellas/reservar?salida=00000000-0000-4000-8000-000000000999&entradas=x");
  await expect(page.getByRole("heading", { level: 1, name: "Esta salida ya no está disponible" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Volver a Teide al atardecer y estrellas" })).toBeVisible();
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
