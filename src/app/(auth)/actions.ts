"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/db/server";
import { loginRules } from "@/lib/domain/rate-limits";
import { requestIp, withinLimits } from "@/lib/rate-limit";
import { PASSWORD_ERROR_MESSAGES, safeNextPath, validateNewPassword } from "@/lib/domain/auth";
import { inviteTokenSchema } from "@/lib/domain/team";

export type LoginState = { error: string | null; email: string };

const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(256),
  next: z.string().max(2048).optional(),
});

const INVALID_CREDENTIALS = "Email o contraseña incorrectos.";

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const raw = {
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
    next: String(formData.get("next") ?? "") || undefined,
  };
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return { error: INVALID_CREDENTIALS, email: raw.email };

  // Supabase ve siempre la IP del servidor: el límite por IP y por cuenta se pone aquí.
  const ip = await requestIp();
  if (ip && !(await withinLimits(loginRules(ip, parsed.data.email)))) {
    return { error: "Demasiados intentos. Espera unos minutos antes de volver a probar.", email: raw.email };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error || !data.user) return { error: INVALID_CREDENTIALS, email: raw.email };

  // Tener cuenta en Auth no basta: hay que ser miembro del equipo.
  const { data: staff } = await supabase.from("staff").select("user_id").eq("user_id", data.user.id).maybeSingle();
  if (!staff) {
    await supabase.auth.signOut();
    return { error: "Tu cuenta no tiene acceso al panel. Pide a un administrador que te dé de alta.", email: raw.email };
  }

  redirect(safeNextPath(parsed.data.next));
}

export async function logout(): Promise<void> {
  const supabase = await createClient();
  // Solo este dispositivo: en la oficina se comparten equipos y no queremos cerrar las demás sesiones.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}

export type AcceptInviteState = { error: string | null };

const INVALID_INVITE = "El enlace no es válido, ya se ha usado o ha caducado. Pide uno nuevo a un administrador.";

/** Acepta una invitación: valida el token de un solo uso y guarda la contraseña elegida. */
export async function acceptInvite(_prev: AcceptInviteState, formData: FormData): Promise<AcceptInviteState> {
  const token = inviteTokenSchema.safeParse(formData.get("token"));
  if (!token.success) return { error: INVALID_INVITE };

  // La contraseña se valida antes de gastar el token: si no cumple, puede corregirla con el mismo enlace.
  const password = String(formData.get("password") ?? "");
  const check = validateNewPassword(password, String(formData.get("confirmation") ?? ""));
  if (!check.ok) return { error: check.errors.map((error) => PASSWORD_ERROR_MESSAGES[error]).join(" ") };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ type: "invite", token_hash: token.data });
  if (error || !data.user) return { error: INVALID_INVITE };

  const { error: passwordError } = await supabase.auth.updateUser({ password });
  if (passwordError) {
    await supabase.auth.signOut({ scope: "local" });
    return { error: "No se pudo guardar la contraseña. Pide a un administrador que te dé de alta otra vez." };
  }

  // Dado de baja mientras la invitación seguía abierta: tiene cuenta pero no acceso.
  const { data: staff } = await supabase.from("staff").select("user_id").eq("user_id", data.user.id).maybeSingle();
  if (!staff) {
    await supabase.auth.signOut({ scope: "local" });
    return { error: "Tu cuenta no tiene acceso al panel. Pide a un administrador que te dé de alta." };
  }

  redirect("/panel");
}
