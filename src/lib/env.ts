import { z } from "zod";

type RawEnv = Record<string, string | undefined>;

// Una variable vacía cuenta como ausente.
const required = z.preprocess((value) => (value === "" ? undefined : value), z.string());

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.preprocess((value) => (value === "" ? undefined : value), z.url()),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: required,
});

const serverSchema = publicSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: required,
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

/** Variables públicas. Se leen de forma literal para que Next.js las incruste en el cliente. */
export function getPublicEnv(): PublicEnv {
  return parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}
