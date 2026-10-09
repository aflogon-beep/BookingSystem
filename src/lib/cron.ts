import { timingSafeEqual } from "node:crypto";

/**
 * Vercel Cron llama con «Authorization: Bearer <CRON_SECRET>». Sin secreto configurado
 * (o con uno demasiado corto) nadie pasa. Compara en tiempo constante.
 */
export function isAuthorizedCron(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || !authorization) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/** Respuesta de error si la llamada no viene del cron (o si falta CRON_SECRET); null si puede seguir. */
export function rejectUnauthorizedCron(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) {
    // Sin secreto el job nunca correría: que se vea en los logs de Vercel.
    console.error("CRON_SECRET no está configurado (o tiene menos de 16 caracteres)");
    return Response.json({ error: "Cron sin configurar" }, { status: 500 });
  }
  if (!isAuthorizedCron(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  return null;
}
