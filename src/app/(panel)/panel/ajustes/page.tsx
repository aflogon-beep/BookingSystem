import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/panel/placeholder-page";
import { requireAccess } from "@/lib/auth";

export const metadata: Metadata = { title: "Ajustes" };

export default async function Page() {
  await requireAccess("ajustes");
  return <PlaceholderPage title="Ajustes" task="1.2" />;
}
