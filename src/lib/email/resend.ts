import "server-only";

import { createHash } from "node:crypto";

import type { EmailContent } from "@/lib/domain/emails";
import { parseEmailConfig } from "@/lib/env";

export type OutgoingEmail = EmailContent & { to: string; replyTo?: string; idempotencyKey: string };

const RESEND_URL = "https://api.resend.com/emails";
// La API por lotes acepta hasta 100 emails por llamada.
const BATCH_SIZE = 100;

let warned = false;

/**
 * Envía emails con la API de Resend y devuelve las idempotencyKey de los que aceptó. Sin
 * RESEND_API_KEY o EMAIL_FROM no envía nada (lo avisa una vez en los logs). Nunca lanza: un
 * email que falla no debe romper una reserva.
 */
export async function sendEmails(emails: readonly OutgoingEmail[]): Promise<Set<string>> {
  const sent = new Set<string>();
  if (!emails.length) return sent;
  const config = parseEmailConfig(process.env);
  if (!config) {
    if (!warned) console.warn("Emails desactivados: faltan RESEND_API_KEY o EMAIL_FROM (o no son válidas).");
    warned = true;
    return sent;
  }

  for (let start = 0; start < emails.length; start += BATCH_SIZE) {
    const chunk = emails.slice(start, start + BATCH_SIZE);
    const payload = chunk.map((email) => ({
      from: config.from,
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(email.replyTo ? { reply_to: email.replyTo } : {}),
    }));
    const single = chunk.length === 1;
    const keys = chunk.map((email) => email.idempotencyKey);
    try {
      const response = await fetch(single ? RESEND_URL : `${RESEND_URL}/batch`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.resendApiKey}`,
          "Content-Type": "application/json",
          // Si se repite la llamada (reintento), Resend no envía dos veces.
          "Idempotency-Key": single ? keys.join("") : `batch/${createHash("sha256").update(keys.join(",")).digest("hex")}`,
        },
        body: JSON.stringify(single ? payload[0] : payload),
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) {
        for (const key of keys) sent.add(key);
      } else {
        // Solo el estado y el mensaje de Resend: nunca la clave ni las direcciones.
        const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
        console.error("Resend rechazó el envío", response.status, typeof body?.message === "string" ? body.message : "");
      }
    } catch (error) {
      console.error("No se pudo contactar con Resend", error instanceof Error ? error.name : "");
    }
  }
  return sent;
}
