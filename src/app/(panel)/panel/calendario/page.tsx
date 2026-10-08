import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/panel/placeholder-page";

export const metadata: Metadata = { title: "Calendario" };

export default function Page() {
  return <PlaceholderPage title="Calendario" task="1.5" />;
}
