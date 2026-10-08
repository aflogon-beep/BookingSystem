"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_ICONS } from "@/components/panel/nav-icons";
import { PANEL_NAV, isNavItemActive } from "@/lib/panel-nav";
import { cn } from "@/lib/utils";

/** Navegación en segunda fila con scroll horizontal (tablet). */
export function NavSub() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Secciones"
      className="sticky top-14 z-30 hidden overflow-x-auto border-b border-line bg-white/85 px-3 backdrop-blur-xl tablet:flex desk:hidden"
    >
      {PANEL_NAV.map((item) => {
        const active = isNavItemActive(item, pathname);
        const Icon = NAV_ICONS[item.id];
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 border-b-2 border-transparent px-2.5 py-2.5 text-[0.84rem] font-medium whitespace-nowrap text-muted-foreground hover:text-foreground",
              active && "border-primary text-primary-dark",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
