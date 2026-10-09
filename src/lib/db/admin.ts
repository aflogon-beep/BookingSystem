import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { parseServerEnv } from "@/lib/env";

/**
 * Cliente con service role: se salta RLS. Solo para operaciones de servidor que lo
 * necesiten (webhooks de Stripe, cron y la web pública, que no tiene sesión). Nunca con datos
 * que no se hayan validado. En la web pública, selecciona solo columnas que pueda ver
 * cualquiera: nada de reservas, clientes ni pasajeros.
 */
export function createAdminClient() {
  const { supabaseUrl, supabaseServiceRoleKey } = parseServerEnv(process.env);

  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
