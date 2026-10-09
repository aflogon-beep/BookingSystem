import { expect, test } from "@playwright/test";
import { addDays, addWeeks, format, parseISO, startOfISOWeek } from "date-fns";
import { es } from "date-fns/locale";

import { businessToday } from "@/lib/domain/schedule";

const PROJECT_WEEKS: Record<string, number> = { movil: 1, tablet: 2, escritorio: 3 };

// Un lunes de dentro de 1-3 semanas, distinto por proyecto: el cambio de fecha solo ofrece salidas
// de los próximos 30 días. Ningún otro e2e usa los lunes ni los martes tan cercanos.
function mondayFor(project: string): string {
  return format(startOfISOWeek(addWeeks(parseISO(businessToday()), PROJECT_WEEKS[project] ?? 1)), "yyyy-MM-dd");
}

test("ficha de reserva: notas, cambio de fecha y cancelación con reembolso", async ({ page }, testInfo) => {
  const monday = mondayFor(testInfo.project.name);
  const tuesday = format(addDays(parseISO(monday), 1), "yyyy-MM-dd");
  const name = `Ficha ${testInfo.project.name} ${Date.now()}`;

  // Reserva pagada con TPV desde el manifiesto del lunes.
  await page.goto(`/panel?fecha=${monday}`);
  await page.getByRole("link", { name: "Manifiesto 16:30 Teide al atardecer y estrellas" }).click();
  await page.getByRole("link", { name: "Añadir reserva" }).click();
  const dialog = page.getByRole("dialog", { name: "Nueva reserva" });
  await dialog.getByLabel("Nombre").fill(name);
  await dialog.getByRole("group", { name: "Cobro" }).getByRole("button", { name: /TPV tarjeta/ }).click();
  await dialog.getByRole("button", { name: "Confirmar reserva" }).click();
  await expect(dialog).toBeHidden();

  // Del manifiesto a la ficha.
  await page.getByRole("row", { name }).getByRole("link", { name }).click();
  await expect(page).toHaveURL(/\/panel\/reservas\/VT[0-9A-Z]{6}$/);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(page.getByText("Pagado", { exact: true })).toBeVisible();
  await expect(page.getByText("Reserva creada")).toBeVisible();

  // Notas internas: se guardan al salir del campo.
  const notes = page.getByLabel("Notas internas");
  await notes.fill("Celíaco");
  await notes.blur();
  await expect(page.getByText("Notas guardadas")).toBeVisible();

  // Cambio de fecha al martes.
  const select = page.getByLabel("Cambiar de fecha");
  const prefix = format(parseISO(tuesday), "EEE d MMM", { locale: es });
  const option = select.locator("option").filter({ hasText: new RegExp(`^${prefix} · 16:30`) });
  await select.selectOption({ label: (await option.textContent()) ?? "" });
  await page.getByRole("button", { name: "Mover" }).click();
  await expect(page.getByText(/^Cambio de fecha: del /)).toBeVisible();
  await expect(page.getByRole("link", { name: /Teide al atardecer y estrellas/ })).toContainText(
    format(parseISO(tuesday), "d 'de' MMMM", { locale: es }),
  );

  // Cancelar con reembolso (dentro del plazo de cancelación gratuita).
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  const cancel = page.getByRole("dialog", { name: "Cancelar reserva" });
  await expect(cancel.getByRole("checkbox", { name: /^Reembolsar / })).toBeChecked();
  await cancel.getByRole("button", { name: "Cancelar reserva" }).click();
  await expect(cancel).toBeHidden();
  await expect(page.getByText("Cancelada", { exact: true })).toBeVisible();
  await expect(page.getByText("Reembolsado", { exact: true })).toBeVisible();
  await expect(page.getByText(/^Reembolsado \d+/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancelar", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Cambiar de fecha")).toHaveCount(0);
});

test("una reserva que no existe da 404", async ({ page }) => {
  expect((await page.goto("/panel/reservas/VT000000"))?.status()).toBe(404);
  expect((await page.goto("/panel/reservas/no-es-un-codigo"))?.status()).toBe(404);
});
