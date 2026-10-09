import { expect, test } from "@playwright/test";
import { addDays, format, parseISO, startOfISOWeek } from "date-fns";

import { calendarTitle, longDayLabel, shiftAnchor, weekdayLabel } from "@/lib/domain/calendar";
import { businessToday } from "@/lib/domain/schedule";

// Ids fijos del seed (supabase/seed.sql). El seed genera las salidas de los próximos 120 días.
const LAGUNA_ID = "00000000-0000-4000-8000-000000000203";

// En local, si el seed tiene más de unos 90 días, vuelve a generar: npx supabase db reset.
// Un miércoles de dentro de unas semanas: el Teide sale todos los días a las 16:30 y La Laguna,
// de martes a domingo a las 10:30.
const WEDNESDAY = format(addDays(startOfISOWeek(addDays(parseISO(businessToday()), 21)), 2), "yyyy-MM-dd");

test("la semana muestra las salidas generadas, de lunes a domingo", async ({ page }) => {
  await page.goto("/panel/calendario");
  await expect(page.getByRole("heading", { level: 1, name: "Calendario" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Semana" })).toHaveAttribute("aria-current", "page");

  await page.goto(`/panel/calendario?fecha=${WEDNESDAY}`);
  await expect(page.getByRole("heading", { level: 2, name: calendarTitle("semana", WEDNESDAY) })).toBeVisible();
  const column = page.getByRole("region", { name: weekdayLabel(WEDNESDAY), exact: true });
  const teide = column.getByRole("listitem").filter({ hasText: "16:30" }).filter({ hasText: "Teide al atardecer y estrellas" });
  await expect(teide).toBeVisible();
  await expect(teide.getByText("0/16")).toBeVisible();
  await expect(column.getByRole("listitem").filter({ hasText: "10:30" }).filter({ hasText: "La Laguna, ciudad Patrimonio" })).toBeVisible();
});

test("filtra por producto y navega entre semanas", async ({ page }) => {
  await page.goto(`/panel/calendario?fecha=${WEDNESDAY}`);
  await page.getByLabel("Producto").selectOption({ label: "La Laguna, ciudad Patrimonio" });
  await expect(page).toHaveURL(new RegExp(`producto=${LAGUNA_ID}`));
  await expect(page.getByLabel("Producto")).toHaveValue(LAGUNA_ID);
  const column = page.getByRole("region", { name: weekdayLabel(WEDNESDAY), exact: true });
  await expect(column.getByRole("listitem").filter({ hasText: "10:30" }).filter({ hasText: "La Laguna, ciudad Patrimonio" })).toBeVisible();
  await expect(column.getByRole("listitem").filter({ hasText: "Teide" })).toHaveCount(0);

  await page.getByRole("link", { name: "Siguiente" }).click();
  const next = shiftAnchor("semana", WEDNESDAY, 1);
  await expect(page.getByRole("heading", { level: 2, name: calendarTitle("semana", next) })).toBeVisible();
  await expect(page.getByLabel("Producto")).toHaveValue(LAGUNA_ID);
});

test("el mes muestra la ocupación y lleva a la semana del día pulsado", async ({ page }) => {
  await page.goto(`/panel/calendario?vista=mes&fecha=${WEDNESDAY}`);
  await expect(page.getByRole("heading", { level: 2, name: calendarTitle("mes", WEDNESDAY) })).toBeVisible();
  await expect(page.getByText(/\d+ salidas · 0\/\d+ plazas \(0%\)/)).toBeVisible();
  await page.getByRole("link", { name: new RegExp(`^${longDayLabel(WEDNESDAY)}: \\d+ salidas, 0 de \\d+ plazas$`) }).click();
  await expect(page).toHaveURL(new RegExp(`fecha=${WEDNESDAY}`));
  await expect(page.getByRole("heading", { level: 2, name: calendarTitle("semana", WEDNESDAY) })).toBeVisible();
});
