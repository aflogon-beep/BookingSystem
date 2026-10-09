import { expect, test } from "@playwright/test";
import { addDays, addWeeks, format, parseISO, startOfISOWeek } from "date-fns";

import { longDayLabel } from "@/lib/domain/calendar";
import { businessToday } from "@/lib/domain/schedule";

const PROJECT_WEEKS: Record<string, number> = { movil: 10, tablet: 11, escritorio: 12 };

// Un viernes de dentro de 10-12 semanas, distinto por proyecto (y del jueves de reservas.spec.ts).
// El Teide sale todos los días a las 16:30, aforo 16 y mínimo 4.
function fridayFor(project: string): string {
  const monday = startOfISOWeek(addWeeks(parseISO(businessToday()), PROJECT_WEEKS[project] ?? 10));
  return format(addDays(monday, 4), "yyyy-MM-dd");
}

test("muestra el día de hoy y navega entre días", async ({ page }) => {
  const today = businessToday();
  await page.goto("/panel");
  await expect(page.getByRole("heading", { level: 1, name: longDayLabel(today) })).toBeVisible();
  await expect(page.getByRole("main").getByText("Hoy", { exact: true }).first()).toBeVisible();
  for (const label of ["Salidas", "Pasajeros", "Check-in", "Ingresos del día"]) {
    await expect(page.getByRole("term").filter({ hasText: label })).toBeVisible();
  }
  await expect(page.getByRole("heading", { level: 2, name: "Requiere atención" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Actividad reciente" })).toBeVisible();

  await page.getByRole("link", { name: "Día siguiente" }).click();
  const tomorrow = format(addDays(parseISO(today), 1), "yyyy-MM-dd");
  await expect(page).toHaveURL(new RegExp(`fecha=${tomorrow}`));
  await expect(page.getByRole("heading", { level: 1, name: longDayLabel(tomorrow) })).toBeVisible();
  await expect(page.getByText("Próximamente")).toBeVisible();
});

test("reserva desde una salida del día y lo refleja en salidas, KPIs y actividad", async ({ page }, testInfo) => {
  const day = fridayFor(testInfo.project.name);
  const name = `Cliente Hoy ${testInfo.project.name}`;
  await page.goto(`/panel?fecha=${day}`);
  await expect(page.getByRole("heading", { level: 1, name: longDayLabel(day) })).toBeVisible();

  const row = page.getByRole("listitem", { name: "16:30 Teide al atardecer y estrellas" });
  await expect(row).toBeVisible();
  const booked = Number((await row.getByText(/\d+ \/ 16 plazas/).textContent())?.match(/(\d+) \//)?.[1]);
  const paxTile = page.locator("dl > div").filter({ has: page.getByRole("term").filter({ hasText: "Pasajeros" }) });
  const paxBefore = Number(await paxTile.getByRole("definition").first().textContent());

  await row.getByRole("link", { name: "Reservar 16:30 Teide al atardecer y estrellas" }).click();
  const dialog = page.getByRole("dialog", { name: "Nueva reserva" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("group", { name: "Salidas del día" }).getByRole("button", { pressed: true })).toContainText("16:30");
  await dialog.getByLabel("Nombre").fill(name);
  await dialog.getByRole("button", { name: "Confirmar reserva" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`fecha=${day}`));

  await expect(row.getByText(`${booked + 1} / 16 plazas`)).toBeVisible();
  if (booked + 1 < 4) await expect(row.getByText("Bajo mínimo")).toBeVisible();
  await expect(paxTile.getByRole("definition").first()).toHaveText(String(paxBefore + 1));
  const activity = page.getByRole("region", { name: "Actividad reciente" });
  await expect(activity.getByText(name).first()).toBeVisible();
});
