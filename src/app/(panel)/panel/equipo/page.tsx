import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/panel/placeholder-page";

export const metadata: Metadata = { title: "Equipo" };

export default function Page() {
  return <PlaceholderPage title="Equipo" task="3.3" />;
}
