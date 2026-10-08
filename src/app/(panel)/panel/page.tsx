import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/panel/placeholder-page";

export const metadata: Metadata = { title: "Hoy" };

export default function Page() {
  return <PlaceholderPage title="Hoy" task="1.8" />;
}
