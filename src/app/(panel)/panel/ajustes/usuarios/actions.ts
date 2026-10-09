"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { requireAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";
import { buildInviteUrl, canManageMember, inviteSchema } from "@/lib/domain/team";

export type InviteResult = { ok: true; url: string } | { ok: false; error: string };
export type MemberResult = { ok: true } | { ok: false; error: string };

const idSchema = z.uuid();
const roleSchema = z.enum(["admin", "staff"]);
const FAILED = "No se pudo completar. Inténtalo de nuevo.";
// Mensaje del trigger staff_keep_one_admin.
const LAST_ADMIN = "Debe quedar al menos un administrador";
const EMAIL_TAKEN = "Ya hay una cuenta con ese email.";

function isEmailTaken(error: { code?: string; message: string } | null): boolean {
  return error?.code === "email_exists" || /already been registered/i.test(error?.message ?? "");
}

function refresh() {
  revalidatePath("/panel/ajustes/usuarios");
}

/** Origen del panel desde el que se invita. Next.js ya comprueba que Origin coincide con Host en las Server Actions. */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Invita a un miembro: crea su cuenta pendiente en Auth y su fila en staff, y devuelve el enlace
 * para que elija contraseña. No se envía email (Resend llega en la tarea 2.3): el admin lo comparte.
 */
export async function inviteMember(input: { email: string; name: string; role: string }): Promise<InviteResult> {
  await requireAccess("ajustes");
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  const { email, name, role } = parsed.data;

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email, options: { data: { name } } });
  if (error || !data.user) {
    return { ok: false, error: isEmailTaken(error) ? EMAIL_TAKEN : FAILED };
  }

  // La fila de staff la inserta el admin con su sesión: RLS vuelve a comprobar que es admin.
  const supabase = await createClient();
  const { error: staffError } = await supabase.from("staff").insert({ user_id: data.user.id, name, role });
  if (staffError) {
    // 23505: ya estaba en el equipo con una invitación pendiente. generateLink acaba de anular su
    // enlace anterior, así que se devuelve el nuevo (su nombre y rol no cambian).
    if (staffError.code === "23505") {
      return { ok: true, url: buildInviteUrl(await requestOrigin(), data.properties.hashed_token) };
    }
    await admin.auth.admin.deleteUser(data.user.id);
    return { ok: false, error: FAILED };
  }

  refresh();
  return { ok: true, url: buildInviteUrl(await requestOrigin(), data.properties.hashed_token) };
}

/** Enlace nuevo para un miembro que aún no ha aceptado (el anterior caduca o se perdió). */
export async function regenerateInvite(userId: string): Promise<InviteResult> {
  await requireAccess("ajustes");
  if (!idSchema.safeParse(userId).success) return { ok: false, error: "Datos no válidos." };

  // Solo miembros del equipo: la sesión del admin tiene que poder ver su fila.
  const supabase = await createClient();
  const { data: member } = await supabase.from("staff").select("user_id").eq("user_id", userId).maybeSingle();
  if (!member) return { ok: false, error: "Ese miembro ya no está en el equipo." };

  const admin = createAdminClient();
  const { data: user } = await admin.auth.admin.getUserById(userId);
  if (!user.user?.email) return { ok: false, error: FAILED };
  if (user.user.email_confirmed_at) {
    return { ok: false, error: "Ya aceptó la invitación. Si no puede entrar, dale de baja y vuelve a invitarle." };
  }

  const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email: user.user.email });
  if (error) return { ok: false, error: FAILED };
  return { ok: true, url: buildInviteUrl(await requestOrigin(), data.properties.hashed_token) };
}

export async function changeMemberRole(userId: string, role: string): Promise<MemberResult> {
  const actor = await requireAccess("ajustes");
  const parsedRole = roleSchema.safeParse(role);
  if (!idSchema.safeParse(userId).success || !parsedRole.success) return { ok: false, error: "Datos no válidos." };
  if (!canManageMember(actor.userId, userId)) return { ok: false, error: "No puedes cambiar tu propio rol." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff")
    .update({ role: parsedRole.data })
    .eq("user_id", userId)
    .select("user_id");
  if (error) return { ok: false, error: error.message === LAST_ADMIN ? `${LAST_ADMIN}.` : FAILED };
  if (data.length !== 1) return { ok: false, error: "Ese miembro ya no está en el equipo." };
  refresh();
  return { ok: true };
}

/** Da de baja: quita la fila de staff (el trigger protege al último admin) y borra la cuenta de Auth. */
export async function removeMember(userId: string): Promise<MemberResult> {
  const actor = await requireAccess("ajustes");
  if (!idSchema.safeParse(userId).success) return { ok: false, error: "Datos no válidos." };
  if (!canManageMember(actor.userId, userId)) return { ok: false, error: "No puedes darte de baja a ti mismo." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("staff").delete().eq("user_id", userId).select("user_id");
  if (error) return { ok: false, error: error.message === LAST_ADMIN ? `${LAST_ADMIN}.` : FAILED };
  if (data.length !== 1) return { ok: false, error: "Ese miembro ya no está en el equipo." };

  // Sin fila en staff ya no entra al panel. Borrar la cuenta permite volver a invitar ese email.
  const { error: deleteError } = await createAdminClient().auth.admin.deleteUser(userId);
  refresh();
  if (deleteError) return { ok: false, error: "Se quitó el acceso, pero no se pudo borrar la cuenta." };
  return { ok: true };
}
