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
  await page.getByLabel("Desde").fill("2030-01-01");
  await expect(page).toHaveURL(/pestana=pasadas&canal=agency&desde=2030-01-01$/);
  await expect(page.getByLabel("Desde")).toHaveValue("2030-01-01");

  // El pulso de 14 días: pulsar un día filtra el listado a ese día y volver a pulsarlo lo quita.
  await page.goto("/panel/reservas");
  const pulse = page.getByRole("list", { name: "Pasajeros por día" });
  await expect(pulse.getByRole("listitem")).toHaveCount(14);
  const today = businessToday();
  await pulse.getByRole("link", { name: /^Hoy/ }).click();
  await expect(page).toHaveURL(new RegExp(`pestana=hoy&desde=${today}&hasta=${today}$`));
  await expect(pulse.getByRole("link", { name: /^Hoy/ })).toHaveAttribute("aria-current", "date");
  await pulse.getByRole("link", { name: /^Hoy/ }).click();
  await expect(page).toHaveURL(/\/panel\/reservas$/);

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
  // Pulsar la fila abre la vista previa sin salir del listado.
  await row.getByRole("link", { name }).click();
  const preview = page.getByRole("dialog");
  await expect(preview.getByRole("heading", { name })).toBeVisible();
  await expect(preview.getByRole("link", { name: "Abrir ficha" })).toHaveAttribute("href", /^\/panel\/reservas\/VT[0-9A-Z]{6}$/);
  await expect(page).toHaveURL(/q=Listado/);
  await page.keyboard.press("Escape");
  await expect(preview).toBeHidden();
  // Marcarla saca la barra de acciones en bloque; Esc la quita.
  await row.getByRole("checkbox", { name: `Marcar ${name}` }).click();
  const bulk = page.getByRole("region", { name: "Acciones con las reservas marcadas" });
  await expect(bulk).toContainText("1 reserva");
  await expect(bulk.getByRole("button", { name: "Cobrar 1 reserva" })).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(bulk).toBeHidden();
  // Las cifras de arriba cuentan hasta su valor: 1 reserva, 1 pasajero y nada cobrado aún.
  const summary = page.getByRole("region", { name: "Resumen de las reservas" });
  await expect(summary).toContainText(/Reservas\s*1\s*Pasajeros\s*1\s*Importe/);
  await expect(summary).toContainText("Faltan");

  // El buscador de arriba encuentra la reserva por nombre y abre la ficha con el código exacto.
  const code = ((await row.getByRole("link").first().getAttribute("href")) ?? "").split("/").pop() ?? "";
  expect(code).not.toBe("");
  const topSearch = page.getByRole("searchbox", { name: "Buscar reserva o cliente" }).filter({ visible: true });
  await topSearch.fill(code.toLowerCase());
  await topSearch.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/panel/reservas/${code}$`));

  // Con el pago pendiente se pueden cambiar las entradas: una persona más.
  await page.getByRole("button", { name: "Cambiar entradas" }).click();
  const lines = page.getByRole("dialog", { name: "Cambiar entradas" });
  await lines.getByRole("button", { name: "Añadir Adulto" }).click();
  await lines.getByRole("button", { name: "Guardar" }).click();
  await expect(lines).toBeHidden();
  await expect(page.getByText(/^Entradas cambiadas: /)).toBeVisible();
  await page.goto("/panel/reservas");
  await page.keyboard.press("/");
  await expect(topSearch).toBeFocused();
  await page.keyboard.type(name);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/pestana=todas&q=Listado/);
  await expect(page.getByRole("row", { name })).toBeVisible();

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
