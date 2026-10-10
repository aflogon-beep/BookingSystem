import type { Metadata } from "next";

import { NavSub } from "@/components/panel/nav-sub";
import { TabBar } from "@/components/panel/tab-bar";
import { TopBar } from "@/components/panel/top-bar";
import { Toaster } from "@/components/ui/sonner";
import { requireStaff } from "@/lib/auth";

import { countAlerts } from "./panel/today-data";

// Backoffice del equipo: solo miembros de staff (el proxy redirige antes, pero la comprobación real es esta).
export const metadata: Metadata = {
  title: { template: "%s · Ruta Reservas", default: "Panel · Ruta Reservas" },
  robots: { index: false, follow: false },
};

export default async function PanelLayout({ children, modal }: LayoutProps<"/">) {
  const staff = await requireStaff();
  // Se recalcula con cada revalidatePath del panel (por ejemplo, al asignar equipo).
  const alerts = await countAlerts();

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#contenido"
        className="sr-only z-50 rounded-full bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Saltar al contenido
      </a>
      <TopBar staff={staff} alerts={alerts} />
      <NavSub role={staff.role} />
      <main id="contenido" className="mx-auto w-full max-w-[1380px] flex-1 px-4 pt-4 pb-28 tablet:px-6 tablet:pt-[22px] tablet:pb-14">
        {children}
      </main>
      {modal}
      <TabBar role={staff.role} name={staff.name} />
      <Toaster />
    </div>
  );
}
