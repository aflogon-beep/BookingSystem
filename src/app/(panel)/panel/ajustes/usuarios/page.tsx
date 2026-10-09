import type { Metadata } from "next";

import { TeamMembers, type MemberRow } from "@/components/ajustes/team-members";
import { requireAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";
import { memberStatus } from "@/lib/domain/team";

export const metadata: Metadata = { title: "Usuarios · Ajustes" };

type AuthUserSummary = { email: string; email_confirmed_at: string | null };

/** Email y estado de cada cuenta de Auth. El equipo es pequeño: basta con paginar. */
async function authUsersById(): Promise<Map<string, AuthUserSummary>> {
  const admin = createAdminClient();
  const users = new Map<string, AuthUserSummary>();
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error("No se pudieron cargar las cuentas del equipo.");
    for (const user of data.users) {
      users.set(user.id, { email: user.email ?? "", email_confirmed_at: user.email_confirmed_at ?? null });
    }
    if (data.users.length < 200) return users;
  }
}

export default async function Page() {
  const actor = await requireAccess("ajustes");
  // Las filas de staff se leen con la sesión del admin (RLS); las cuentas, con la service role.
  const supabase = await createClient();
  const [{ data: staff, error }, users] = await Promise.all([
    supabase.from("staff").select("user_id, name, role, created_at").order("created_at"),
    authUsersById(),
  ]);
  if (error) throw new Error("No se pudo cargar el equipo.");

  const members: MemberRow[] = staff.map((member) => {
    const user = users.get(member.user_id);
    return {
      userId: member.user_id,
      name: member.name,
      email: user?.email ?? "",
      role: member.role === "admin" ? "admin" : "staff",
      status: memberStatus(user),
      isSelf: member.user_id === actor.userId,
    };
  });

  return <TeamMembers members={members} />;
}
