import "server-only";

import { headers } from "next/headers";

import { createAdminClient } from "@/lib/db/admin";
import { clientIpFrom, type RateRule } from "@/lib/domain/rate-limits";

/** IP pública del cliente de esta petición, o null en local y en los tests. */
export async function requestIp(): Promise<string | null> {
  return clientIpFrom((await headers()).get("x-forwarded-for"));
}

/**
 * Cuenta un intento en cada regla (rate_limit_hit, con la service role). false si alguna ya ha
 * llegado a su límite. Si el contador falla, deja pasar: no se bloquean ventas por un fallo suyo.
 */
export async function withinLimits(rules: readonly RateRule[]): Promise<boolean> {
  const db = createAdminClient();
  for (const rule of rules) {
    const { data, error } = await db.rpc("rate_limit_hit", {
      p_key: rule.key,
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds,
    });
    if (error) {
      console.error("rate_limit_hit falló", error.code);
      continue;
    }
    if (data === false) return false;
  }
  return true;
}
