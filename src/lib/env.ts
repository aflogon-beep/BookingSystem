import { z } from "zod";

type RawEnv = Record<string, string | undefined>;

// Una variable vacía cuenta como ausente.
const emptyAsUndefined = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema);

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: emptyAsUndefined(z.url({ protocol: /^https?$/ })),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: emptyAsUndefined(z.string()),
});

const serverSchema = publicSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: emptyAsUndefined(z.string()),
});

function parse<T extends z.ZodType>(schema: T, raw: RawEnv): z.infer<T> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    // Solo los nombres: nunca el valor, que puede ser un secreto.
    const names = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(`Variables de entorno ausentes o no válidas: ${names.join(", ")}`);
  }
  return result.data;
}

export type PublicEnv = { supabaseUrl: string; supabaseAnonKey: string };
export type ServerEnv = PublicEnv & { supabaseServiceRoleKey: string };

export function parsePublicEnv(raw: RawEnv): PublicEnv {
  const env = parse(publicSchema, raw);
  return {
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

export function parseServerEnv(raw: RawEnv): ServerEnv {
  const env = parse(serverSchema, raw);
  return {
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

export type EmailConfig = { resendApiKey: string; from: string };

// «Volcán Tours <reservas@dominio.com>» o solo «reservas@dominio.com».
const FROM = /^(?:[^<>@\r\n]{1,100} <[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+>|[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+)$/;

/**
 * Emails con Resend (RESEND_API_KEY y EMAIL_FROM). Son opcionales: sin ellas, o si no son
 * válidas, devuelve null y no se envía ningún email (la reserva sigue funcionando).
 */
export function parseEmailConfig(raw: RawEnv): EmailConfig | null {
  const resendApiKey = raw.RESEND_API_KEY?.trim();
  const from = raw.EMAIL_FROM?.trim();
  if (!resendApiKey || !from || !FROM.test(from)) return null;
  return { resendApiKey, from };
}

/** Variables públicas. Se leen de forma literal para que Next.js las incruste en el cliente. */
export function getPublicEnv(): PublicEnv {
  return parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}
