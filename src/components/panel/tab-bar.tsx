"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronRight, LogOut, Menu, Plus, Store } from "lucide-react";

import { logout } from "@/app/(auth)/actions";

import { NAV_ICONS } from "@/components/panel/nav-icons";
import { focusRing } from "@/components/panel/styles";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { canAccess, type StaffRole } from "@/lib/domain/auth";
import { NEW_BOOKING_HREF, TAB_BAR_IDS, isMoreActive, isNavItemActive, navItem, visibleNav } from "@/lib/panel-nav";
import { cn } from "@/lib/utils";

// Inactivas en muted-foreground (no faint como el prototipo): faint no llega a 4,5:1 a este tamaño.
const tabClass = cn(
  focusRing,
  "flex min-h-11 min-w-14 flex-col items-center justify-center gap-0.5 rounded-lg px-2 text-[0.64rem] font-medium text-muted-foreground",
);

/** Barra de pestañas inferior (móvil): Hoy, Calendario, +, Reservas, Más. */
export function TabBar({ role, name }: { role: StaffRole; name: string }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [hoy, calendario, reservas] = TAB_BAR_IDS.map(navItem);
  const moreItems = visibleNav((id) => canAccess(role, id)).filter((item) => !TAB_BAR_IDS.includes(item.id));

  const tab = (item: typeof hoy) => {
    if (!item) return null;
    const active = isNavItemActive(item, pathname);
    const Icon = NAV_ICONS[item.id];
    return (
      <Link href={item.href} aria-current={active ? "page" : undefined} className={cn(tabClass, active && "text-primary")}>
        <Icon className="size-5" strokeWidth={active ? 2.4 : 2} aria-hidden="true" />
        {item.label}
      </Link>
    );
  };

  return (
    <nav
      aria-label="Pestañas"
      className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-line bg-white/88 px-1.5 pt-1.5 pb-[calc(6px+env(safe-area-inset-bottom,0px))] backdrop-blur-xl backdrop-saturate-180 tablet:hidden"
    >
      {tab(hoy)}
      {tab(calendario)}
      <Link
        href={NEW_BOOKING_HREF}
        aria-label="Nueva reserva"
        className="-mt-[18px] grid size-[46px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_6px_16px_rgb(0_113_227/0.35)]"
      >
        <Plus className="size-6" aria-hidden="true" />
      </Link>
      {tab(reservas)}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetTrigger
          aria-current={isMoreActive(pathname) ? "page" : undefined}
          className={cn(tabClass, isMoreActive(pathname) && "text-primary")}
        >
          <Menu className="size-5" aria-hidden="true" />
          Más
        </SheetTrigger>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Más secciones</SheetTitle>
            <SheetDescription className="sr-only">Resto de secciones del panel</SheetDescription>
          </SheetHeader>
          <ul className="min-h-0 overflow-y-auto px-3 pb-4">
            {[...moreItems.map((item) => ({ ...item, Icon: NAV_ICONS[item.id] })), { id: "web", label: "Web de reservas", href: "/", Icon: Store }].map(
              ({ id, label, href, Icon }) => (
                <li key={id}>
                  <Link
                    href={href}
                    onClick={() => setMoreOpen(false)}
                    className="flex min-h-12 items-center gap-3 rounded-xl px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring text-[0.95rem] text-foreground hover:bg-line-2"
                  >
                    <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
                    <span className="flex-1">{label}</span>
                    <ChevronRight className="size-4 text-faint" aria-hidden="true" />
                  </Link>
                </li>
              ),
            )}
          </ul>
          <form action={logout} className="border-t border-line px-3 pt-2 pb-4">
            <button
              type="submit"
              className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-left text-[0.95rem] text-foreground outline-none hover:bg-line-2 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <LogOut className="size-5 text-muted-foreground" aria-hidden="true" />
              <span className="flex-1">
                Salir <span className="text-muted-foreground">· {name}</span>
              </span>
            </button>
          </form>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
