import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { parseServerEnv } from "@/lib/env";

export type Db = SupabaseClient<Database>;

const env = parseServerEnv(process.env);
const options = { auth: { persistSession: false, autoRefreshToken: false } };

export const adminDb: Db = createClient<Database>(env.supabaseUrl, env.supabaseServiceRoleKey, options);
export const anonDb = (): Db => createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, options);

export const TEST_PASSWORD = "Prueba2026abc";

export type TestUser = { id: string; email: string; db: Db };

/** Crea un usuario de Auth (opcionalmente en staff) y devuelve un cliente con su sesión. */
export async function createTestUser(staff?: { name: string; role: "admin" | "staff" }): Promise<TestUser> {
  const email = `test-${randomUUID()}@example.test`;
  const { data, error } = await adminDb.auth.admin.createUser({ email, password: TEST_PASSWORD, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("Sin usuario");
  if (staff) {
    const { error: staffError } = await adminDb.from("staff").insert({ user_id: data.user.id, ...staff });
    if (staffError) throw staffError;
  }
  const db = anonDb();
  const { error: signInError } = await db.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (signInError) throw signInError;
  return { id: data.user.id, email, db };
}

export async function deleteTestUsers(users: (TestUser | undefined)[]): Promise<void> {
  for (const user of users) {
    if (user) await adminDb.auth.admin.deleteUser(user.id);
  }
}
