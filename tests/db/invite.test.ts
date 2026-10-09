import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { adminDb, anonDb } from "./helpers";

// Flujo de invitación que usa Ajustes > Usuarios (src/app/(panel)/panel/ajustes/usuarios/actions.ts)
// y la página /invitacion (src/app/(auth)/actions.ts), contra el Auth de Supabase local.

const email = `invitado-${randomUUID()}@example.test`;
const PASSWORD = "Invitado2026abc";
let userId: string | undefined;

afterAll(async () => {
  if (userId) await adminDb.auth.admin.deleteUser(userId);
});

describe("Invitaciones del equipo", () => {
  it("crea la cuenta pendiente, permite un enlace nuevo y al aceptar fija la contraseña", async () => {
    const first = await adminDb.auth.admin.generateLink({ type: "invite", email });
    expect(first.error).toBeNull();
    userId = first.data.user!.id;
    expect(first.data.user!.email_confirmed_at ?? null).toBeNull();

    // Enlace nuevo para la misma persona mientras sigue pendiente (botón «Enlace»).
    const second = await adminDb.auth.admin.generateLink({ type: "invite", email });
    expect(second.error).toBeNull();
    expect(second.data.user!.id).toBe(userId);
    expect(second.data.properties!.hashed_token).not.toBe(first.data.properties!.hashed_token);

    const db = anonDb();
    const verify = await db.auth.verifyOtp({ type: "invite", token_hash: second.data.properties!.hashed_token });
    expect(verify.error).toBeNull();
    expect(verify.data.user?.id).toBe(userId);

    const update = await db.auth.updateUser({ password: PASSWORD });
    expect(update.error).toBeNull();

    const { data: user } = await adminDb.auth.admin.getUserById(userId);
    expect(user.user?.email_confirmed_at).toBeTruthy();

    const login = await anonDb().auth.signInWithPassword({ email, password: PASSWORD });
    expect(login.error).toBeNull();
  });

  it("el enlace solo sirve una vez", async () => {
    const link = await adminDb.auth.admin.generateLink({ type: "magiclink", email });
    expect(link.error).toBeNull();
    const db = anonDb();
    expect((await db.auth.verifyOtp({ type: "magiclink", token_hash: link.data.properties!.hashed_token })).error).toBeNull();
    expect((await anonDb().auth.verifyOtp({ type: "magiclink", token_hash: link.data.properties!.hashed_token })).error).not.toBeNull();
  });

  it("no invita a un email que ya tiene cuenta activa", async () => {
    const again = await adminDb.auth.admin.generateLink({ type: "invite", email });
    expect(again.error).not.toBeNull();
    expect(again.error?.code).toBe("email_exists");
  });
});
