import { expect, test } from "@playwright/test";
import { addDays, addWeeks, format, parseISO, startOfISOWeek } from "date-fns";

import { weekdayLabel } from "@/lib/domain/calendar";
import { businessToday } from "@/lib/domain/schedule";

const PROJECT_WEEKS: Record<string, number> = { movil: 10, tablet: 11, escritorio: 12 };

// Un jueves de dentro de unas 10-12 semanas, distinto por proyecto para que las reservas no se pisen
// (y lejos del mes que comprueba calendario.spec.ts). El Teide sale todos los días a las 16:30.
function thursdayFor(project: string): string {
  const monday = startOfISOWeek(addWeeks(parseISO(businessToday()), PROJECT_WEEKS[project] ?? 10));
  return format(addDays(monday, 3), "yyyy-MM-dd");
}

test("crea una reserva de agencia desde el modal y el calendario la cuenta", async ({ page }, testInfo) => {
  const day = thursdayFor(testInfo.project.name);
  await page.goto(`/panel/calendario?fecha=${day}`);
  await expect(page.getByRole("heading", { level: 1, name: "Calendario" })).toBeVisible();

  await page.getByRole("link", { name: "Nueva reserva" }).filter({ visible: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Nueva reserva" });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("Producto").selectOption({ label: "Teide al atardecer y estrellas" });
  await dialog.getByLabel("Fecha").fill(day);
  const slot = dialog.getByRole("group", { name: "Salidas del día" }).getByRole("button").filter({ hasText: "16:30" });
  await expect(slot).toContainText("libres");
  const free = Number((await slot.textContent())?.match(/(\d+) libres/)?.[1]);
  await slot.click();
  await expect(slot).toHaveAttribute("aria-pressed", "true");

  // Empieza con 1 adulto: añade otro.
  await expect(dialog.getByLabel("Adulto: cantidad")).toHaveText("1");
  await dialog.getByRole("button", { name: "Añadir Adulto" }).click();
  await expect(dialog.getByLabel("Adulto: cantidad")).toHaveText("2");

  await dialog.getByLabel("Nombre").fill("Cliente de prueba e2e");
  await dialog.getByLabel("Hotel de recogida").fill("Hotel Mencey");
  await dialog.getByRole("group", { name: "Canal" }).getByRole("button", { name: /Agencia/ }).click();
  await expect(dialog.getByRole("group", { name: "Cobro" }).getByRole("button", { name: /Factura a agencia/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await dialog.getByLabel("Agencia u hotel").fill("Agencia Atlántico");
  await expect(dialog.getByRole("complementary", { name: "Resumen" })).toContainText("138");

  await dialog.getByRole("button", { name: "Confirmar reserva" }).click();
  await expect(page.getByText(/^Reserva VT[0-9A-Z]{6} creada$/)).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`fecha=${day}`));

  const column = page.getByRole("region", { name: weekdayLabel(day), exact: true });
  const teide = column.getByRole("listitem").filter({ hasText: "16:30" }).filter({ hasText: "Teide al atardecer y estrellas" });
  await expect(teide.getByText(`${16 - free + 2}/16`)).toBeVisible();
});

test("la página completa de nueva reserva se abre al entrar por URL", async ({ page }) => {
  await page.goto("/panel/reservas/nueva");
  await expect(page.getByRole("heading", { level: 1, name: "Nueva reserva" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("Producto")).toBeVisible();
});
