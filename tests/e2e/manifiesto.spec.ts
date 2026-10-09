import { expect, test } from "@playwright/test";
import { addDays, addWeeks, format, parseISO, startOfISOWeek } from "date-fns";

import { businessToday } from "@/lib/domain/schedule";

const PROJECT_WEEKS: Record<string, number> = { movil: 10, tablet: 11, escritorio: 12 };

// Un sábado de dentro de 10-12 semanas, distinto por proyecto (y de los días de hoy.spec.ts y
// reservas.spec.ts). El Teide sale todos los días a las 16:30 con mínimo 4.
function saturdayFor(project: string): string {
  const monday = startOfISOWeek(addWeeks(parseISO(businessToday()), PROJECT_WEEKS[project] ?? 10));
  return format(addDays(monday, 5), "yyyy-MM-dd");
}

test("del día al manifiesto: reserva, check-in, cobro, aforo y estado de la salida", async ({ page }, testInfo) => {
  const day = saturdayFor(testInfo.project.name);
  const name = `Pasajero ${testInfo.project.name} ${Date.now()}`;

  await page.goto(`/panel?fecha=${day}`);
  await page.getByRole("link", { name: "Manifiesto 16:30 Teide al atardecer y estrellas" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Teide al atardecer y estrellas" })).toBeVisible();
  await expect(page).toHaveURL(/\/panel\/salidas\/[0-9a-f-]{36}$/);
  const manifestUrl = page.url();

  // Añadir una reserva que se paga allí (queda pendiente de cobro).
  await page.getByRole("link", { name: "Añadir reserva" }).click();
  const dialog = page.getByRole("dialog", { name: "Nueva reserva" });
  await expect(dialog.getByRole("group", { name: "Salidas del día" }).getByRole("button", { pressed: true })).toContainText("16:30");
  await dialog.getByLabel("Nombre").fill(name);
  await dialog.getByRole("group", { name: "Cobro" }).getByRole("button", { name: /Paga allí/ }).click();
  await dialog.getByRole("button", { name: "Confirmar reserva" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(manifestUrl);

  const row = page.getByRole("row", { name });
  await expect(row).toBeVisible();

  // Check-in.
  const checkIn = row.getByRole("button", { name: `Check-in ${name}` });
  await expect(checkIn).toHaveAttribute("aria-pressed", "false");
  await checkIn.click();
  await expect(checkIn).toHaveAttribute("aria-pressed", "true");

  // Cobro en efectivo.
  await row.getByRole("button", { name: /^Cobrar / }).click();
  const collect = page.getByRole("dialog");
  await collect.getByRole("button", { name: "Efectivo" }).click();
  await expect(collect).toBeHidden();
  await expect(row.getByText("Pagada")).toBeVisible();

  // Aforo solo de esta salida.
  const occupancy = page.locator("dl > div").filter({ has: page.getByRole("term").filter({ hasText: "Ocupación" }) });
  const capacity = Number((await occupancy.getByRole("definition").first().textContent())?.match(/\/\s*(\d+)/)?.[1]);
  await page.getByLabel("Aforo de esta salida").fill(String(capacity + 1));
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(occupancy.getByRole("definition").first()).toContainText(`/ ${capacity + 1}`);

  // Cerrar la venta y volver a abrirla.
  const status = page.getByRole("group", { name: "Estado de la salida" });
  await status.getByRole("button", { name: "Cerrar venta" }).click();
  await expect(status.getByRole("button", { name: "Cerrar venta" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Añadir reserva" })).toBeDisabled();
  await status.getByRole("button", { name: "A la venta" }).click();
  await expect(status.getByRole("button", { name: "A la venta" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("link", { name: "Añadir reserva" })).toBeVisible();
});

test("una salida que no existe da 404", async ({ page }) => {
  const response = await page.goto("/panel/salidas/00000000-0000-4000-8000-000000000999");
  expect(response?.status()).toBe(404);
});
