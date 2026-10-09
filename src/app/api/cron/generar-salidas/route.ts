import { isAuthorizedCron } from "@/lib/cron";
import { createAdminClient } from "@/lib/db/admin";
import { generationWindow } from "@/lib/domain/schedule";

// Job diario (vercel.json): genera las salidas de los próximos 120 días a partir de las reglas.
// Usa service role porque no hay sesión de usuario; solo entra quien tenga CRON_SECRET.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const { from, to } = generationWindow();
  const { data, error } = await createAdminClient().rpc("generate_sessions", { p_from: from, p_to: to });
  if (error) {
    console.error("generate_sessions falló", error.code, error.message);
    return Response.json({ error: "No se pudieron generar las salidas" }, { status: 500 });
  }
  return Response.json({ from, to, changed: data });
}
