import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/panel/placeholder-page";

export const metadata: Metadata = { title: "Clientes" };

export default function Page() {
  return <PlaceholderPage title="Clientes" task="3.4" />;
}
