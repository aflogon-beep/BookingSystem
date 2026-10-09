import { z } from "zod";

import type { StaffRole } from "@/lib/domain/auth";

export const ROLE_LABELS: Record<StaffRole, string> = {
  admin: "Administrador",
  staff: "Equipo",
};

export const ROLE_DESCRIPTIONS: Record<StaffRole, string> = {
  admin: "Todo, incluidos Ajustes y usuarios.",
  staff: "Opera el día a día, sin Ajustes.",
};

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email({ error: "El email no es válido." }).max(254)),
  name: z
    .string()
    .trim()
    .min(1, { error: "Escribe el nombre." })
    .max(120, { error: "El nombre admite 120 caracteres como máximo." }),
  role: z.enum(["admin", "staff"], { error: "Elige un rol." }),
});

export type InviteInput = z.infer<typeof inviteSchema>;

export type MemberStatus = "active" | "pending";

/** Activo cuando ha aceptado la invitación (email confirmado al poner su contraseña). */
export function memberStatus(user: { email_confirmed_at?: string | null } | undefined): MemberStatus {
  return user?.email_confirmed_at ? "active" : "pending";
}

/**
 * Nadie cambia su propio rol ni se da de baja a sí mismo: evita quedarse fuera de Ajustes
 * por error. Otro administrador puede hacerlo. Que quede al menos un admin lo garantiza la BD.
 */
export function canManageMember(actorId: string, targetId: string): boolean {
  return actorId !== targetId;
}

/** Enlace que se comparte con la persona invitada para que elija su contraseña. */
export function buildInviteUrl(origin: string, tokenHash: string): string {
  const url = new URL("/invitacion", origin);
  url.searchParams.set("token", tokenHash);
  return url.toString();
}

/** El token de invitación de Supabase es un hash hexadecimal. */
export const inviteTokenSchema = z.string().regex(/^[0-9a-f]{20,128}$/i);
