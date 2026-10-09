import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/database.types";
import { getPublicEnv } from "@/lib/env";

/**
 * Cliente de Supabase para componentes cliente. Usa la clave pública y la sesión de las
 * cookies, así que respeta RLS (y las políticas de Storage). Solo para subir fotos.
 */
export function createClient() {
  const { supabaseUrl, supabaseAnonKey } = getPublicEnv();
  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}
