import { expect, test } from "@playwright/test";

// Los tests que cambian datos corren solo en escritorio (los proyectos van en paralelo contra la
// misma BD) y dejan los datos como estaban.

test("Equipo muestra las fichas del seed por tipo", async ({ page }) => {
  await page.goto("/panel/equipo?vista=fichas");
  await expect(page.getByRole("heading", { level: 1, name: "Equipo" })).toBeVisible();

  const tipos = page.getByRole("navigation", { name: "Tipo de recurso" });
  await expect(tipos.getByRole("link", { name: /Guías/ })).toHaveAttribute("aria-current", "page");
  const ana = page.getByRole("listitem", { name: "Ana Pérez" });
  await expect(ana.getByText(/salidas? esta semana/)).toBeVisible();
  await expect(ana.getByRole("button", { name: "Inglés" })).toHaveAttribute("aria-pressed", "true");
  await expect(ana.getByRole("button", { name: "Alemán" })).toHaveAttribute("aria-pressed", "false");

  await expect(page.getByRole("heading", { name: "Planificación de esta semana" })).toBeVisible();
  await expect(page.getByRole("row", { name: "Ana Pérez" })).toBeVisible();

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

  await page.goto("/panel/equipo?vista=fichas");
  await page.getByRole("button", { name: "Añadir guía" }).click();
  // El nombre del nuevo queda seleccionado: se escribe encima.
  const nameInput = page.getByRole("listitem", { name: "Nuevo guía" }).last().getByLabel("Nombre");
  await expect(nameInput).toBeFocused();
  await page.keyboard.type(name);
  await page.keyboard.press("Enter");
  await expect(page.getByText("Guardado").first()).toBeVisible();

  const card = page.getByRole("listitem", { name });
  await expect(card).toBeVisible();
  // Un guía nuevo guía en el primer idioma de Ajustes.
  await expect(card.getByRole("button", { name: "Español" })).toHaveAttribute("aria-pressed", "true");
  await card.getByRole("button", { name: "Alemán" }).click();
  await expect(card.getByRole("button", { name: "Alemán" })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByRole("listitem", { name }).getByRole("button", { name: "Alemán" })).toHaveAttribute(
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

test("Dónde están: estado del equipo por día", async ({ page }, testInfo) => {
  await page.goto("/panel/equipo");
  const vistas = page.getByRole("navigation", { name: "Vista del equipo" });
  await expect(vistas.getByRole("link", { name: "Dónde están" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText(/ahora mismo ·/)).toBeVisible();
  await expect(page.getByText("Salidas sin equipo")).toBeVisible();
  // En móvil es una tarjeta y en tablet o escritorio una fila de la línea de tiempo.
  await expect(page.getByLabel("Ana Pérez", { exact: true }).filter({ visible: true })).toBeVisible();

  await page.getByRole("link", { name: "Día siguiente" }).click();
  await expect(page).toHaveURL(/fecha=\d{4}-\d{2}-\d{2}$/);
  await expect(page.getByText("Asignaciones del día")).toBeVisible();

  if (testInfo.project.name === "escritorio") {
    await page.getByRole("button", { name: "Asignar pendientes" }).click();
    await expect(page.getByText(/con equipo asignado|No había salidas pendientes|Asignado\./)).toBeVisible();
  }

  await vistas.getByRole("link", { name: "Fichas y planificación" }).click();
  await expect(page).toHaveURL(/vista=fichas$/);
  await expect(page.getByRole("listitem", { name: "Ana Pérez" })).toBeVisible();
});
