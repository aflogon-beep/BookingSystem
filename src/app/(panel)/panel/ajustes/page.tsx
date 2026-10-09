import { redirect } from "next/navigation";

import { requireAccess } from "@/lib/auth";

export default async function Page() {
  await requireAccess("ajustes");
  redirect("/panel/ajustes/empresa");
}
