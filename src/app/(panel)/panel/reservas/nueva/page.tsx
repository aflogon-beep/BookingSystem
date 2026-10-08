import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/panel/placeholder-page";

export const metadata: Metadata = { title: "Nueva reserva" };

export default function Page() {
  return <PlaceholderPage title="Nueva reserva" task="1.7" />;
}
