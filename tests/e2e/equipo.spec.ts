import { expect, test } from "@playwright/test";

// Los tests que cambian datos corren solo en escritorio (los proyectos van en paralelo contra la
// misma BD) y dejan los datos como estaban.

test("Equipo muestra las fichas del seed por tipo", async ({ page }) => {
  await page.goto("/panel/equipo");
  await expect(page.getByRole("heading", { level: 1, name: "Equipo" })).toBeVisible();

  const tipos = page.getByRole("navigation", { name: "Tipo de recurso" });
  await expect(tipos.getByRole("link", { name: /Guías/ })).toHaveAttribute("aria-current", "page");
  const ana = page.getByRole("listitem", { name: "Ana Pérez" });
  await expect(ana.getByText(/salidas? esta semana/)).toBeVisible();
  await expect(ana.getByRole("button", { name: "Inglés" })).toHaveAttribute("aria-pressed", "true");
  await expect(ana.getByRole("button", { name: "Alemán" })).toHaveAttribute("aria-pressed", "false");

  await tipos.getByRole("link", { name: /Vehículos/ }).click();
  await expect(page).toHaveURL(/tipo=vehiculos$/);
  await expect(page.getByRole("listitem", { name: "Minibús 01" }).getByLabel("Asientos")).toHaveValue("16");
  await expect(page.getByRole("button", { name: "Añadir vehículo" })).toBeVisible();

  await tipos.getByRole("link", { name: /Equipos/ }).click();
  await expect(page.getByRole("listitem", { name: "Telescopio Dobson" }).getByLabel("Unidades")).toHaveValue("1");
});

test("añade un guía, lo renombra, cambia sus idiomas y lo elimina", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "escritorio", "cambia datos: solo en escritorio");
  const name = `Guía e2e ${Date.now()}`;

  await page.goto("/panel/equipo");
  await page.getByRole("button", { name: "Añadir guía" }).click();
  // El nombre del nuevo queda seleccionado: se escribe encima.
  const nameInput = page.getByRole("listitem", { name: "Nuevo guía" }).last().getByLabel("Nombre");
  await expect(nameInput).toBeFocused();
  await page.keyboard.type(name);
  await page.keyboard.press("Enter");
  await expect(page.getByText("Guardado").first()).toBeVisible();

  const card = page.getByRole("listitem", { name });
  await expect(card).toBeVisible();
  await expect(card.getByText("Sin idiomas no se le asignará ninguna salida.")).toBeVisible();
  await card.getByRole("button", { name: "Francés" }).click();
  await expect(card.getByRole("button", { name: "Francés" })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByRole("listitem", { name }).getByRole("button", { name: "Francés" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByRole("listitem", { name }).getByRole("button", { name: `Eliminar ${name}` }).click();
  const dialog = page.getByRole("dialog", { name: `¿Eliminar «${name}»?` });
  await expect(dialog.getByText(`Se quitará a ${name} de todas las salidas donde esté asignado.`)).toBeVisible();
  await dialog.getByRole("button", { name: "Eliminar" }).click();
  await expect(page.getByRole("listitem", { name })).toHaveCount(0);
});

test("los asientos de un vehículo se validan y se guardan", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "escritorio", "cambia datos: solo en escritorio");
  await page.goto("/panel/equipo?tipo=vehiculos");

  const seats = page.getByRole("listitem", { name: "Furgoneta 08" }).getByLabel("Asientos");
  await seats.fill("0");
  await seats.blur();
  await expect(page.getByText("Mínimo 1.").first()).toBeVisible();

  await seats.fill("9");
  await seats.blur();
  await expect(page.getByText("Guardado").first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole("listitem", { name: "Furgoneta 08" }).getByLabel("Asientos")).toHaveValue("9");

  await page.getByRole("listitem", { name: "Furgoneta 08" }).getByLabel("Asientos").fill("8");
  await page.getByRole("listitem", { name: "Furgoneta 08" }).getByLabel("Asientos").blur();
  await expect(page.getByText("Guardado").first()).toBeVisible();
});
