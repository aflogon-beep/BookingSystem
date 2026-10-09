import { expect, test, type Page } from "@playwright/test";

// Ids fijos del seed (supabase/seed.sql).
const TEIDE_ID = "00000000-0000-4000-8000-000000000201";

// PNG de 1×1 px para probar la subida de fotos.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const tab = (page: Page, name: string) => page.getByRole("tab", { name });

test("la lista muestra los productos del seed con sus horarios", async ({ page }) => {
  await page.goto("/panel/productos");
  await expect(page.getByRole("heading", { level: 1, name: "Productos" })).toBeVisible();
  const teide = page.getByRole("listitem", { name: "Teide al atardecer y estrellas" });
  await expect(teide).toBeVisible();
  await expect(teide.getByText("Todos los días · 16:30 · ES")).toBeVisible();
  await expect(teide.getByText("16 plazas")).toBeVisible();
});

test("el editor muestra las pestañas y la vista previa de salidas", async ({ page }) => {
  await page.goto(`/panel/productos/${TEIDE_ID}`);
  await expect(page.getByRole("heading", { level: 1, name: "Teide al atardecer y estrellas" })).toBeVisible();
  await expect(tab(page, "General")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Nombre del tour")).toHaveValue("Teide al atardecer y estrellas");

  await tab(page, "Entradas y precios").click();
  await expect(page.getByLabel("Precio de Adulto")).toHaveValue("69");
  await expect(page.getByLabel("Precio de Bebé")).toHaveValue("0");

  await tab(page, "Horarios").click();
  await expect(page.getByRole("listitem", { name: "Regla 1" }).getByLabel("Horas de salida")).toHaveValue("16:30");
  // 14 salidas diarias a las 16:30 más las de inglés y alemán.
  await expect(page.getByText(/\d+ salidas · \d+ plazas a la venta en 14 días/)).toBeVisible();

  // Sin guardar: el cambio solo afecta a la vista previa.
  await page.getByRole("listitem", { name: "Regla 1" }).getByRole("button", { name: "Quitar regla 1" }).click();
  await page.getByRole("button", { name: "Quitar regla 1" }).click();
  await page.getByRole("button", { name: "Quitar regla 1" }).click();
  await expect(page.getByText("Sin reglas este producto no genera salidas.")).toBeVisible();
  await expect(page.getByText("Con estas reglas no sale ninguna salida.")).toBeVisible();

  // La barra de guardar queda visible (en móvil, por encima de la barra de pestañas).
  await expect(page.getByRole("button", { name: "Guardar producto" })).toBeInViewport();
});

test("valida antes de guardar y lleva a la pestaña con el error", async ({ page }) => {
  await page.goto("/panel/productos/nuevo");
  await expect(page.getByRole("heading", { level: 1, name: "Nuevo producto" })).toBeVisible();
  await page.getByRole("button", { name: "Guardar producto" }).click();
  await expect(page.getByText("Ponle nombre al producto")).toBeVisible();

  await page.getByLabel("Nombre del tour").fill("Tour sin entradas");
  await tab(page, "Entradas y precios").click();
  await page.getByRole("switch", { name: "Vende Adulto" }).click();
  await tab(page, "General").click();
  await page.getByRole("button", { name: "Guardar producto" }).click();
  await expect(page.getByText("Activa al menos un tipo de entrada")).toBeVisible();
  await expect(tab(page, "Entradas y precios")).toHaveAttribute("aria-selected", "true");

  await page.getByRole("switch", { name: "Vende Adulto" }).click();
  await page.getByLabel("Precio de Adulto").fill("12,555");
  await page.getByRole("button", { name: "Guardar producto" }).click();
  await expect(page.getByText("Pon un precio válido a «Adulto», por ejemplo 45 o 12,50")).toBeVisible();

  await page.getByLabel("Precio de Adulto").fill("12");
  await tab(page, "General").click();
  await page.getByLabel("Mínimo para salir").fill("99");
  await page.getByRole("button", { name: "Guardar producto" }).click();
  await expect(page.getByText("El mínimo para salir no puede ser mayor que el aforo.")).toBeVisible();
});

test("crea, edita, retira de la venta y elimina un producto con foto", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "escritorio", "cambia datos: solo en escritorio");
  const name = `Tour e2e ${Date.now()}`;

  await page.goto("/panel/productos");
  await page.getByRole("link", { name: "Nuevo producto" }).first().click();
  await expect(page).toHaveURL(/\/panel\/productos\/nuevo$/);
  await page.getByLabel("Nombre del tour").fill(name);
  await page.getByLabel("Descripción", { exact: true }).fill("Ruta de prueba por Anaga.");
  await page.getByLabel("Foto del tour").setInputFiles({ name: "foto.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByRole("button", { name: "Quitar foto" })).toBeVisible();

  await tab(page, "Entradas y precios").click();
  await page.getByLabel("Precio de Adulto").fill("25,50");

  await tab(page, "Horarios").click();
  const rule = page.getByRole("listitem", { name: "Regla 1" });
  await rule.getByLabel("Horas de salida").fill("9:00, 17:30");
  await rule.getByRole("button", { name: "sábado" }).click();
  await expect(page.getByText(/\d+ salidas · \d+ plazas a la venta en 14 días/)).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Así lo verá el cliente" }).getByText("25,50 €")).toBeVisible();

  await page.getByRole("button", { name: "Guardar producto" }).click();
  await expect(page.getByText("Producto guardado")).toBeVisible();
  await expect(page).toHaveURL(/\/panel\/productos$/);

  const card = page.getByRole("listitem", { name });
  await expect(card).toBeVisible();
  await expect(card.getByText("Lun–Sáb · 09:00, 17:30 · ES")).toBeVisible();
  await expect(card.getByText("desde 25,50 €")).toBeVisible();
  await expect(card.locator("img")).toHaveAttribute("src", /\/storage\/v1\/object\/public\/product-photos\/.+\.png$/);

  // Editar: los cambios se guardan y la foto se puede quitar.
  await card.getByRole("link", { name: `Editar ${name}` }).click();
  await expect(page.getByLabel("Nombre del tour")).toHaveValue(name);
  await page.getByLabel("Aforo por salida").fill("8");
  await page.getByRole("button", { name: "Quitar foto" }).click();
  await page.getByRole("button", { name: "Guardar producto" }).click();
  await expect(page).toHaveURL(/\/panel\/productos$/);
  await expect(card.getByText("8 plazas")).toBeVisible();
  await expect(card.locator("img")).toHaveCount(0);

  // A la venta: el interruptor de la tarjeta.
  await card.getByRole("switch", { name: `${name}: a la venta` }).click();
  await expect(card.getByText("Inactivo")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("listitem", { name }).getByText("Inactivo")).toBeVisible();

  // Eliminar.
  await page.getByRole("listitem", { name }).getByRole("link", { name: `Editar ${name}` }).click();
  await page.getByRole("button", { name: "Eliminar" }).click();
  const dialog = page.getByRole("dialog", { name: `¿Eliminar «${name}»?` });
  await dialog.getByRole("button", { name: "Eliminar" }).click();
  await expect(page).toHaveURL(/\/panel\/productos$/);
  await expect(page.getByRole("listitem", { name })).toHaveCount(0);
});
