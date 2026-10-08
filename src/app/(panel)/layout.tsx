import type { Metadata } from "next";

import { NavSub } from "@/components/panel/nav-sub";
import { TabBar } from "@/components/panel/tab-bar";
import { TopBar } from "@/components/panel/top-bar";

// Backoffice del equipo. El login que lo protege llega en la tarea 0.5.
export const metadata: Metadata = {
  title: { template: "%s · Ruta Reservas", default: "Panel · Ruta Reservas" },
  robots: { index: false, follow: false },
};

export default function PanelLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#contenido"
        className="sr-only z-50 rounded-full bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Saltar al contenido
      </a>
      <TopBar />
      <NavSub />
      <main id="contenido" className="mx-auto w-full max-w-[1380px] flex-1 px-4 pt-4 pb-28 tablet:px-6 tablet:pt-[22px] tablet:pb-14">
        {children}
      </main>
      <TabBar />
    </div>
  );
}
