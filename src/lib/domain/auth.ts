import type { NavId } from "@/lib/panel-nav";

export type StaffRole = "admin" | "staff";

/** Política de contraseñas del equipo. Debe coincidir con [auth] en supabase/config.toml. */
export const PASSWORD_MIN_LENGTH = 10;

export type PasswordError = "too_short" | "missing_lowercase" | "missing_uppercase" | "missing_digit" | "mismatch";

export const PASSWORD_ERROR_MESSAGES: Record<PasswordError, string> = {
  too_short: `Debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
  missing_lowercase: "Debe incluir alguna minúscula.",
  missing_uppercase: "Debe incluir alguna mayúscula.",
  missing_digit: "Debe incluir algún número.",
  mismatch: "Las dos contraseñas no coinciden.",
};

export function validateNewPassword(
  password: string,
  confirmation: string,
): { ok: true } | { ok: false; errors: PasswordError[] } {
  const errors: PasswordError[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) errors.push("too_short");
  if (!/[a-z]/.test(password)) errors.push("missing_lowercase");
  if (!/[A-Z]/.test(password)) errors.push("missing_uppercase");
  if (!/[0-9]/.test(password)) errors.push("missing_digit");
  if (password !== confirmation) errors.push("mismatch");
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

const DEFAULT_NEXT = "/panel";

/** Destino tras el login: solo rutas internas del panel, para evitar redirecciones abiertas. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next) return DEFAULT_NEXT;
  // Una ruta interna empieza por una sola «/». «//» y «/\» son URLs de otro dominio.
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return DEFAULT_NEXT;
  const path = next.split(/[?#]/, 1)[0] ?? "";
  if (path !== "/panel" && !path.startsWith("/panel/")) return DEFAULT_NEXT;
  return next;
}

/** Secciones solo para admin (PRD: el staff opera, sin ajustes). */
const ADMIN_ONLY: readonly NavId[] = ["ajustes"];

export function canAccess(role: StaffRole, section: NavId): boolean {
  return role === "admin" || !ADMIN_ONLY.includes(section);
}
