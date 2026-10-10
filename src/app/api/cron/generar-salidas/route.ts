import { rejectUnauthorizedCron } from "@/lib/cron";
import { createAdminClient } from "@/lib/db/admin";
import { generationWindow } from "@/lib/domain/schedule";

// Job diario (vercel.json): genera las salidas de los próximos 120 días a partir de las reglas y
// anonimiza los clientes que han pasado el plazo de conservación (RGPD).
// Usa service role porque no hay sesión de usuario; solo entra quien tenga CRON_SECRET.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const rejected = rejectUnauthorizedCron(request);
  if (rejected) return rejected;

  const db = createAdminClient();
  const { from, to } = generationWindow();
  const [generated, anonymized] = await Promise.all([
    db.rpc("generate_sessions", { p_from: from, p_to: to }),
    db.rpc("anonymize_expired_customers"),
  ]);
  if (anonymized.error) console.error("anonymize_expired_customers falló", anonymized.error.code, anonymized.error.message);
  if (generated.error) {
    console.error("generate_sessions falló", generated.error.code, generated.error.message);
    return Response.json({ error: "No se pudieron generar las salidas" }, { status: 500 });
  }
  // Si solo falla la anonimización, las salidas sí se han generado: se dice y se reintenta mañana.
  return Response.json({ from, to, changed: generated.data, anonymized: anonymized.error ? null : anonymized.data });
}
