import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/db/server";
import { canAccess, type StaffRole } from "@/lib/domain/auth";
import type { NavId } from "@/lib/panel-nav";

export type StaffMember = { userId: string; name: string; role: StaffRole };

function isStaffRole(value: string): value is StaffRole {
  return value === "admin" || value === "staff";
}

/**
 * Miembro del equipo de la sesión actual, o null si no hay sesión válida o el usuario
 * no está en staff. Se cachea por petición.
 */
export const getCurrentStaff = cache(async (): Promise<StaffMember | null> => {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (typeof userId !== "string") return null;

  const { data: row } = await supabase.from("staff").select("name, role").eq("user_id", userId).maybeSingle();
  if (!row || !isStaffRole(row.role)) return null;

  return { userId, name: row.name, role: row.role };
});

/** Exige un miembro del equipo. Sin él, redirige al login. */
export async function requireStaff(): Promise<StaffMember> {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");
  return staff;
}

/** Exige acceso a una sección del panel según el rol. Sin permiso, vuelve a Hoy. */
export async function requireAccess(section: NavId): Promise<StaffMember> {
  const staff = await requireStaff();
  if (!canAccess(staff.role, section)) redirect("/panel");
  return staff;
}
