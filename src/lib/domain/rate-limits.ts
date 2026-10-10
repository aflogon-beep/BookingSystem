/** Una regla de límite: como mucho `limit` intentos con la misma clave en `windowSeconds`. */
export type RateRule = { key: string; limit: number; windowSeconds: number };

const MINUTE = 60;
const DAY = 24 * 60 * MINUTE;

const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** Reserva web sin pago: frena a quien intente llenar las salidas o mandar emails a terceros. */
export function webBookingRules(ip: string, email: string): RateRule[] {
  return [
    { key: `web-booking:ip:${ip}`, limit: 5, windowSeconds: 10 * MINUTE },
    { key: `web-booking:email:${normalizeEmail(email)}`, limit: 5, windowSeconds: DAY },
  ];
}

/** Login del equipo: por IP y por cuenta, para que nadie pruebe contraseñas a ciegas. */
export function loginRules(ip: string, email: string): RateRule[] {
  return [
    { key: `login:ip:${ip}`, limit: 20, windowSeconds: 15 * MINUTE },
    { key: `login:email:${normalizeEmail(email)}`, limit: 8, windowSeconds: 15 * MINUTE },
  ];
}

/**
 * IP del cliente según la cabecera x-forwarded-for (en Vercel la pone la plataforma: el primer
 * valor es el cliente). null si no hay una IP pública, como en local o en los tests (127.0.0.1):
 * ahí no se limita.
 */
export function clientIpFrom(forwardedFor: string | null): string | null {
  const ip = forwardedFor?.split(",")[0]?.trim().toLowerCase() ?? "";
  if (!ip || ip.length > 64) return null;
  const local = ["127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost"];
  return local.includes(ip) ? null : ip;
}
