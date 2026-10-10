import { expect, test } from "@playwright/test";
import { addDays, addWeeks, format, parseISO, startOfISOWeek } from "date-fns";

import { businessToday } from "@/lib/domain/schedule";

// Un viernes de dentro de 13 semanas: no lo usa ningún otro spec. El Teide sale a las 16:30.
function fridayIn13Weeks(): string {
  const monday = startOfISOWeek(addWeeks(parseISO(businessToday()), 13));
  return format(addDays(monday, 4), "yyyy-MM-dd");
}

test("Reservas y Clientes se abren con sus pestañas y filtros", async ({ page }) => {
  await page.goto("/panel/reservas");
  await expect(page.getByRole("heading", { level: 1, name: "Reservas" })).toBeVisible();
  const tabs = page.getByRole("navigation", { name: "Estado de las reservas" });
  await expect(tabs.getByRole("link", { name: "Próximas" })).toHaveAttribute("aria-current", "page");
  await tabs.getByRole("link", { name: "Pasadas" }).click();
  await expect(page).toHaveURL(/pestana=pasadas$/);
  await expect(tabs.getByRole("link", { name: "Pasadas" })).toHaveAttribute("aria-current", "page");
  await page.getByLabel("Canal").selectOption("agency");
  await expect(page).toHaveURL(/pestana=pasadas&canal=agency$/);

  await page.goto("/panel/clientes");
  await expect(page.getByRole("heading", { level: 1, name: "Clientes" })).toBeVisible();
  await expect(page.getByText(/repiten$/)).toBeVisible();
});

test("una reserva nueva sale en el listado, en el CSV y en la ficha del cliente", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "escritorio", "cambia datos: solo en escritorio");
  const day = fridayIn13Weeks();
  const name = `Listado e2e ${Date.now()}`;

  await page.goto("/panel/reservas");
  await page.getByRole("link", { name: "Nueva reserva" }).filter({ visible: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Nueva reserva" });
  await dialog.getByLabel("Producto").selectOption({ label: "Teide al atardecer y estrellas" });
  await dialog.getByLabel("Fecha").fill(day);
  await dialog.getByRole("group", { name: "Salidas del día" }).getByRole("button").filter({ hasText: "16:30" }).click();
  await dialog.getByLabel("Nombre").fill(name);
  await dialog.getByLabel("Email").fill(`listado-${Date.now()}@example.test`);
  await dialog.getByRole("group", { name: "Cobro" }).getByRole("button", { name: /Paga allí/ }).click();
  await dialog.getByRole("button", { name: "Confirmar reserva" }).click();
  await expect(dialog).toBeHidden();

  // Búsqueda en el listado (próximas): sale con pago pendiente.
  await page.goto("/panel/reservas");
  await page.getByLabel("Buscar reservas").fill(name);
  await expect(page).toHaveURL(/q=Listado/);
  const row = page.getByRole("row", { name });
  await expect(row).toBeVisible();
  await expect(row.getByText("Pendiente")).toBeVisible();
  await expect(page.getByText(/^1 reserva · 1 pasajero ·/)).toBeVisible();

  // El CSV lleva los mismos filtros.
  const csvHref = await page.getByRole("link", { name: "Exportar CSV" }).getAttribute("href");
  expect(csvHref).toContain("q=Listado");
  const csv = await page.request.get(csvHref ?? "");
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const text = await csv.text();
  expect(text).toContain(name);
  expect(text.trim().split("\r\n")).toHaveLength(2);

  // Ficha del cliente.
  await page.goto(`/panel/clientes?q=${encodeURIComponent(name)}`);
  await page.getByRole("row", { name }).getByRole("link", { name }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(page.getByText("Teide al atardecer y estrellas")).toBeVisible();
});
