import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/panel/placeholder-page";

export const metadata: Metadata = { title: "Productos" };

export default function Page() {
  return <PlaceholderPage title="Productos" task="1.3" />;
}
