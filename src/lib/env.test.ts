import { describe, expect, it } from "vitest";

import { parseEmailConfig, parsePublicEnv, parseServerEnv } from "@/lib/env";

const validPublic = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
};

describe("parsePublicEnv", () => {
  it("devuelve la URL y la clave anónima", () => {
    expect(parsePublicEnv(validPublic)).toEqual({
      supabaseUrl: "http://127.0.0.1:54321",
      supabaseAnonKey: "anon-key",
    });
  });

  it("falla nombrando la variable que falta", () => {
    expect(() => parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: validPublic.NEXT_PUBLIC_SUPABASE_URL })).toThrow(
      /NEXT_PUBLIC_SUPABASE_ANON_KEY/,
    );
  });

  it("trata una variable vacía como ausente", () => {
    expect(() => parsePublicEnv({ ...validPublic, NEXT_PUBLIC_SUPABASE_ANON_KEY: "" })).toThrow(
      /NEXT_PUBLIC_SUPABASE_ANON_KEY/,
    );
  });

  it("no expone la clave de service role aunque venga en la entrada", () => {
    expect(parsePublicEnv({ ...validPublic, SUPABASE_SERVICE_ROLE_KEY: "service-key" })).not.toHaveProperty(
      "supabaseServiceRoleKey",
    );
  });

  it("rechaza una URL que no es http o https", () => {
    expect(() => parsePublicEnv({ ...validPublic, NEXT_PUBLIC_SUPABASE_URL: "ftp://127.0.0.1" })).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL/,
    );
  });

  it("rechaza una URL no válida", () => {
    expect(() => parsePublicEnv({ ...validPublic, NEXT_PUBLIC_SUPABASE_URL: "no-es-una-url" })).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL/,
    );
  });
});

describe("parseServerEnv", () => {
  it("añade la clave de service role", () => {
    expect(parseServerEnv({ ...validPublic, SUPABASE_SERVICE_ROLE_KEY: "service-key" })).toEqual({
      supabaseUrl: "http://127.0.0.1:54321",
      supabaseAnonKey: "anon-key",
      supabaseServiceRoleKey: "service-key",
    });
  });

  it("falla si falta la clave de service role", () => {
    expect(() => parseServerEnv(validPublic)).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("no incluye la configuración de email", () => {
    expect(parseServerEnv({ ...validPublic, SUPABASE_SERVICE_ROLE_KEY: "k", RESEND_API_KEY: "re_x" })).not.toHaveProperty(
      "resendApiKey",
    );
  });

  it("nunca incluye valores en el mensaje de error", () => {
    const secret = "super-secreto-que-no-debe-salir";
    let message = "";
    try {
      parseServerEnv({ NEXT_PUBLIC_SUPABASE_URL: secret, SUPABASE_SERVICE_ROLE_KEY: secret });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toBe("");
    expect(message).not.toContain(secret);
  });
});

describe("parseEmailConfig", () => {
  it("devuelve la clave y el remitente", () => {
    expect(parseEmailConfig({ RESEND_API_KEY: " re_123 ", EMAIL_FROM: "Volcán Tours <reservas@volcan.es>" })).toEqual({
      resendApiKey: "re_123",
      from: "Volcán Tours <reservas@volcan.es>",
    });
    expect(parseEmailConfig({ RESEND_API_KEY: "re_123", EMAIL_FROM: "reservas@volcan.es" })?.from).toBe("reservas@volcan.es");
  });

  it("sin clave o sin remitente, no hay emails", () => {
    expect(parseEmailConfig({})).toBeNull();
    expect(parseEmailConfig({ RESEND_API_KEY: "re_123" })).toBeNull();
    expect(parseEmailConfig({ RESEND_API_KEY: "", EMAIL_FROM: "reservas@volcan.es" })).toBeNull();
  });

  it("rechaza un remitente mal escrito", () => {
    for (const from of ["volcan.es", "Volcán <reservas>", "a@b.es\nBcc: x@y.es", "<reservas@volcan.es>"]) {
      expect(parseEmailConfig({ RESEND_API_KEY: "re_123", EMAIL_FROM: from })).toBeNull();
    }
  });
});
