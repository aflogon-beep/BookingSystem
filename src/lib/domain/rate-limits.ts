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

/**
 * Login del equipo: por IP y por IP + cuenta, para que nadie pruebe contraseñas a ciegas. No hay
 * límite solo por cuenta: cualquiera que supiera el email de un admin podría dejarlo sin entrar.
 */
export function loginRules(ip: string, email: string): RateRule[] {
  return [
    { key: `login:ip:${ip}`, limit: 20, windowSeconds: 15 * MINUTE },
    { key: `login:ip-email:${ip}:${normalizeEmail(email)}`, limit: 8, windowSeconds: 15 * MINUTE },
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
  if (local.includes(ip)) return null;
  return ip.includes(":") ? ipv6Prefix(ip) : ip;
}

/**
 * Una conexión IPv6 suele tener un bloque /64 entero y puede cambiar de dirección en cada
 * petición: se limita por el bloque (los 4 primeros grupos). Una IPv4 escrita como IPv6
 * (::ffff:1.2.3.4) cuenta como la IPv4.
 */
function ipv6Prefix(ip: string): string {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  if (mapped?.[1]) return mapped[1];
  const [head = "", tail] = ip.split("::", 2);
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = tail === undefined ? left : [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right];
  return `${groups
    .slice(0, 4)
    .map((group) => group.replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}
