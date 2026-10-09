"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/db/server";
import { safeNextPath } from "@/lib/domain/auth";

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
  await supabase.auth.signOut();
  redirect("/login");
}
