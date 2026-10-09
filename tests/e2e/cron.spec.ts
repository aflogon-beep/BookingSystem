import { expect, test } from "@playwright/test";

test("el cron de salidas no se puede llamar sin el secreto", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "escritorio", "basta con un proyecto");
  const anonymous = await request.get("/api/cron/generar-salidas", { headers: { cookie: "" } });
  expect(anonymous.status()).toBe(401);
  const wrong = await request.get("/api/cron/generar-salidas", { headers: { authorization: "Bearer no-es-el-secreto-correcto" } });
  expect(wrong.status()).toBe(401);
});
