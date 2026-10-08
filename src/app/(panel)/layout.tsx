import type { Metadata } from "next";

import { NavSub } from "@/components/panel/nav-sub";
import { TabBar } from "@/components/panel/tab-bar";
import { TopBar } from "@/components/panel/top-bar";

// Backoffice del equipo. El login que lo protege llega en la tarea 0.5.
export const metadata: Metadata = {
  title: { template: "%s · Ruta Reservas", default: "Panel · Ruta Reservas" },
  robots: { index: false, follow: false },
};

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar />
      <NavSub />
      <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 pt-4 pb-28 tablet:px-6 tablet:pt-6 tablet:pb-10">
        {children}
      </main>
      <TabBar />
    </div>
  );
}
