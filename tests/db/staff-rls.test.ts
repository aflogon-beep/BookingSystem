import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { anonDb, createTestUser, deleteTestUsers, type TestUser } from "./helpers";

let admin: TestUser;
let member: TestUser;
let outsider: TestUser;

beforeAll(async () => {
  admin = await createTestUser({ name: "Ana Admin", role: "admin" });
  member = await createTestUser({ name: "Beto Staff", role: "staff" });
  outsider = await createTestUser();
});

afterAll(async () => {
  await deleteTestUsers([outsider, member, admin]);
});

describe("RLS de staff", () => {
  it("anon no puede leer staff", async () => {
    const { data, error } = await anonDb().from("staff").select("*");
    expect(data ?? []).toEqual([]);
    expect(error?.code).toBe("42501");
  });

  it("un miembro solo ve su propia fila", async () => {
    const { data, error } = await member.db.from("staff").select("user_id, name, role");
    expect(error).toBeNull();
    expect(data).toEqual([{ user_id: member.id, name: "Beto Staff", role: "staff" }]);
  });

  it("un usuario sin fila en staff no ve nada", async () => {
    const { data, error } = await outsider.db.from("staff").select("*");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("un miembro no puede ascenderse ni darse de alta", async () => {
    const update = await member.db.from("staff").update({ role: "admin" }).eq("user_id", member.id).select();
    expect(update.data).toEqual([]);
    const insert = await outsider.db.from("staff").insert({ user_id: outsider.id, name: "Intruso", role: "admin" });
    expect(insert.error?.code).toBe("42501");
  });

  it("el admin ve y gestiona el equipo", async () => {
    const { data } = await admin.db.from("staff").select("user_id").in("user_id", [admin.id, member.id]);
    expect(data).toHaveLength(2);

    const insert = await admin.db.from("staff").insert({ user_id: outsider.id, name: "Nuevo", role: "staff" }).select("name");
    expect(insert.error).toBeNull();
    expect(insert.data).toEqual([{ name: "Nuevo" }]);

    const remove = await admin.db.from("staff").delete().eq("user_id", outsider.id).select("user_id");
    expect(remove.data).toHaveLength(1);
  });

  it("is_admin e is_staff responden según el rol", async () => {
    expect((await admin.db.rpc("is_admin")).data).toBe(true);
    expect((await member.db.rpc("is_admin")).data).toBe(false);
    expect((await member.db.rpc("is_staff")).data).toBe(true);
    expect((await outsider.db.rpc("is_staff")).data).toBe(false);
    expect((await anonDb().rpc("is_admin")).error?.code).toBe("42501");
  });

  it("siempre queda al menos un admin", async () => {
    // Si este test corre sobre una BD con otros admins, el trigger no salta: solo lo comprobamos
    // cuando el admin de prueba es el único.
    const { data: admins } = await admin.db.from("staff").select("user_id").eq("role", "admin");
    if (admins?.length === 1) {
      const demote = await admin.db.from("staff").update({ role: "staff" }).eq("user_id", admin.id);
      expect(demote.error?.message).toContain("al menos un administrador");
    }
  });
});
