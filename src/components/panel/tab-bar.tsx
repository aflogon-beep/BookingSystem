"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronRight, Menu, Plus, Store } from "lucide-react";

import { NAV_ICONS } from "@/components/panel/nav-icons";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NEW_BOOKING_HREF, PANEL_NAV, TAB_BAR_IDS, isMoreActive, isNavItemActive, navItem } from "@/lib/panel-nav";
import { cn } from "@/lib/utils";

const tabClass =
  "flex min-h-11 min-w-14 flex-col items-center justify-center gap-0.5 rounded-lg px-2 text-[0.64rem] font-medium text-faint";

/** Barra de pestañas inferior (móvil): Hoy, Calendario, +, Reservas, Más. */
export function TabBar() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [hoy, calendario, reservas] = TAB_BAR_IDS.map(navItem);
  const moreItems = PANEL_NAV.filter((item) => !TAB_BAR_IDS.includes(item.id));

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
        className="-mt-[18px] grid size-[46px] place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_6px_16px_rgb(0_113_227/0.35)]"
      >
        <Plus className="size-6" aria-hidden="true" />
      </Link>
      {tab(reservas)}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetTrigger className={cn(tabClass, isMoreActive(pathname) && "text-primary")}>
          <Menu className="size-5" aria-hidden="true" />
          Más
        </SheetTrigger>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Más secciones</SheetTitle>
            <SheetDescription className="sr-only">Resto de secciones del panel</SheetDescription>
          </SheetHeader>
          <ul className="px-3 pb-4">
            {[...moreItems.map((item) => ({ ...item, Icon: NAV_ICONS[item.id] })), { id: "web", label: "Web de reservas", href: "/", Icon: Store }].map(
              ({ id, label, href, Icon }) => (
                <li key={id}>
                  <Link
                    href={href}
                    onClick={() => setMoreOpen(false)}
                    className="flex min-h-12 items-center gap-3 rounded-xl px-2 text-[0.95rem] text-foreground hover:bg-line-2"
                  >
                    <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
                    <span className="flex-1">{label}</span>
                    <ChevronRight className="size-4 text-faint" aria-hidden="true" />
                  </Link>
                </li>
              ),
            )}
          </ul>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
