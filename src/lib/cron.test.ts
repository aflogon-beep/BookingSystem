import { describe, expect, it } from "vitest";

import { isAuthorizedCron } from "./cron";

const SECRET = "un-secreto-largo-de-prueba";

describe("isAuthorizedCron", () => {
  it("acepta solo el secreto exacto con Bearer", () => {
    expect(isAuthorizedCron(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(isAuthorizedCron(SECRET, SECRET)).toBe(false);
    expect(isAuthorizedCron(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(isAuthorizedCron(null, SECRET)).toBe(false);
  });

  it("sin secreto configurado, o con uno corto, no deja pasar a nadie", () => {
    expect(isAuthorizedCron("Bearer ", undefined)).toBe(false);
    expect(isAuthorizedCron("Bearer ", "")).toBe(false);
    expect(isAuthorizedCron("Bearer corto", "corto")).toBe(false);
  });
});
