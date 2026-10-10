import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adminDb, anonDb, createTestUser, deleteTestUsers, type TestUser } from "./helpers";

const key = `test:${randomUUID()}`;
let member: TestUser;

beforeAll(async () => {
  member = await createTestUser({ name: "Lola Staff", role: "staff" });
});

afterAll(async () => {
  await adminDb.from("rate_limit_hits").delete().eq("key", key);
  await deleteTestUsers([member]);
});

describe("rate_limit_hit", () => {
  it("deja pasar hasta el límite y después no", async () => {
    const results: (boolean | null)[] = [];
    for (let i = 0; i < 4; i++) {
      const { data, error } = await adminDb.rpc("rate_limit_hit", { p_key: key, p_limit: 3, p_window_seconds: 60 });
      expect(error).toBeNull();
      results.push(data);
    }
    expect(results).toEqual([true, true, true, false]);
  });

  it("solo lo usa el servidor: ni anon ni el equipo pueden llamarlo ni leer la tabla", async () => {
    for (const db of [anonDb(), member.db]) {
      const { error } = await db.rpc("rate_limit_hit", { p_key: key, p_limit: 100, p_window_seconds: 60 });
      expect(error).not.toBeNull();
      const { data } = await db.from("rate_limit_hits").select("key").eq("key", key);
      expect(data ?? []).toEqual([]);
    }
  });
});
