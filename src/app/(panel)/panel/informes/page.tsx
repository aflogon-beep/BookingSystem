import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/panel/placeholder-page";

export const metadata: Metadata = { title: "Informes" };

export default function Page() {
  return <PlaceholderPage title="Informes" task="3.5" />;
}
