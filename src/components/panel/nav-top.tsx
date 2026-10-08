"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { PANEL_NAV, isNavItemActive } from "@/lib/panel-nav";
import { cn } from "@/lib/utils";

/** Navegación principal en la barra superior (escritorio). */
export function NavTop() {
  const pathname = usePathname();

  return (
    <nav aria-label="Principal" className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-hidden desk:flex">
      {PANEL_NAV.filter((item) => item.inTopNav).map((item) => {
        const active = isNavItemActive(item, pathname);
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-full px-3 py-1.5 text-[0.85rem] font-medium whitespace-nowrap text-muted-foreground hover:text-foreground",
              active && "bg-black/[0.06] text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
