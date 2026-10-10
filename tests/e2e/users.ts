import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { parseServerEnv } from "@/lib/env";

/** Usuarios fijos de los e2e. Solo en Supabase local o de CI: nunca datos reales. */
export const E2E_PASSWORD = "E2ePrueba2026";
export const E2E_USERS = {
  admin: { email: "e2e-admin@example.test", name: "Admin E2E", role: "admin" },
  staff: { email: "e2e-staff@example.test", name: "Staff E2E", role: "staff" },
  // Cuenta de Auth sin fila en staff: no debe poder entrar al panel.
  outsider: { email: "e2e-outsider@example.test", name: null, role: null },
} as const;

/** Cliente con la service role de la BD local o de CI, para preparar y limpiar datos de los e2e. */
export function e2eAdminDb() {
  const env = parseServerEnv(process.env);
  return createClient<Database>(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Crea o actualiza los usuarios de prueba (idempotente). */
export async function ensureE2EUsers(): Promise<void> {
  const admin = e2eAdminDb();

  const { data: list, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;

  for (const user of Object.values(E2E_USERS)) {
    let id = list.users.find((existing) => existing.email === user.email)?.id;
    if (id) {
      const { error } = await admin.auth.admin.updateUserById(id, { password: E2E_PASSWORD });
      if (error) throw error;
    } else {
      const { data, error } = await admin.auth.admin.createUser({ email: user.email, password: E2E_PASSWORD, email_confirm: true });
      if (error || !data.user) throw error ?? new Error("Sin usuario");
      id = data.user.id;
    }
    if (user.role) {
      const { error } = await admin.from("staff").upsert({ user_id: id, name: user.name, role: user.role });
      if (error) throw error;
    }
  }
}
