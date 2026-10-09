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
