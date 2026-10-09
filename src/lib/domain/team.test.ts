import { describe, expect, it } from "vitest";

import { buildInviteUrl, canManageMember, inviteSchema, inviteTokenSchema, memberStatus } from "./team";

describe("inviteSchema", () => {
  it("normaliza el email y recorta el nombre", () => {
    expect(inviteSchema.parse({ email: " Ana@Volcan.ES ", name: " Ana Pérez ", role: "staff" })).toEqual({
      email: "ana@volcan.es",
      name: "Ana Pérez",
      role: "staff",
    });
  });

  it("rechaza email no válido, nombre vacío o rol desconocido", () => {
    expect(inviteSchema.safeParse({ email: "ana", name: "Ana", role: "staff" }).success).toBe(false);
    expect(inviteSchema.safeParse({ email: "ana@volcan.es", name: "  ", role: "staff" }).success).toBe(false);
    expect(inviteSchema.safeParse({ email: "ana@volcan.es", name: "Ana", role: "guia" }).success).toBe(false);
  });
});

describe("memberStatus", () => {
  it("está pendiente hasta que confirma el email al aceptar la invitación", () => {
    expect(memberStatus({ email_confirmed_at: null })).toBe("pending");
    expect(memberStatus(undefined)).toBe("pending");
    expect(memberStatus({ email_confirmed_at: "2026-10-09T10:00:00Z" })).toBe("active");
  });
});

describe("canManageMember", () => {
  it("no permite cambiarse el rol ni darse de baja a uno mismo", () => {
    expect(canManageMember("u1", "u1")).toBe(false);
    expect(canManageMember("u1", "u2")).toBe(true);
  });
});

describe("buildInviteUrl", () => {
  it("apunta a la página de invitación con el token", () => {
    expect(buildInviteUrl("https://reservas.example.com", "abc123")).toBe(
      "https://reservas.example.com/invitacion?token=abc123",
    );
  });
});

describe("inviteTokenSchema", () => {
  it("solo acepta hashes hexadecimales", () => {
    expect(inviteTokenSchema.safeParse("a".repeat(56)).success).toBe(true);
    expect(inviteTokenSchema.safeParse("abc").success).toBe(false);
    expect(inviteTokenSchema.safeParse("z".repeat(56)).success).toBe(false);
  });
});
