import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/panel/placeholder-page";

export const metadata: Metadata = { title: "Ajustes" };

export default function Page() {
  return <PlaceholderPage title="Ajustes" task="1.2" />;
}
