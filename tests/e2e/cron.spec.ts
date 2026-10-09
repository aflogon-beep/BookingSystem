import { expect, test } from "@playwright/test";

test("el cron de salidas no se puede llamar sin el secreto", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "escritorio", "basta con un proyecto");
  // En CI no hay CRON_SECRET: responde 500 sin ejecutar nada. Con secreto, 401 sin él.
  const anonymous = await request.get("/api/cron/generar-salidas", { headers: { cookie: "" } });
  expect([401, 500]).toContain(anonymous.status());
  const wrong = await request.get("/api/cron/generar-salidas", { headers: { authorization: "Bearer no-es-el-secreto-correcto" } });
  expect([401, 500]).toContain(wrong.status());
  expect(await wrong.json()).not.toHaveProperty("changed");
});
