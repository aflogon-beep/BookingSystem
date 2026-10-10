import { expect, test } from "@playwright/test";

test("Informes muestra los indicadores y cambia entre los últimos y los próximos 30 días", async ({ page }) => {
  await page.goto("/panel/informes");
  await expect(page.getByRole("heading", { level: 1, name: "Informes" })).toBeVisible();
  await expect(page.getByText("Salidas de los últimos 30 días")).toBeVisible();
  for (const label of ["Ingresos", "Pasajeros", "Ticket medio", "Ocupación"]) {
    await expect(page.getByRole("term").filter({ hasText: label })).toBeVisible();
  }
  await expect(page.getByRole("list", { name: "Ingresos por día" }).getByRole("listitem")).toHaveCount(30);

  const periods = page.getByRole("navigation", { name: "Periodo del informe" });
  await periods.getByRole("link", { name: "Próximos 30 días" }).click();
  await expect(page).toHaveURL(/periodo=futuros$/);
  await expect(periods.getByRole("link", { name: "Próximos 30 días" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Reservas ya hechas para los próximos 30 días")).toBeVisible();
  await expect(page.getByText("Reservado, aún por realizar")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Por producto" })).toBeVisible();
});
