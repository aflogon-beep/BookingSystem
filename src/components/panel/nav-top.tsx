"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { canAccess, type StaffRole } from "@/lib/domain/auth";
import { isNavItemActive, visibleNav } from "@/lib/panel-nav";
import { focusRing } from "@/components/panel/styles";
import { cn } from "@/lib/utils";

/** Navegación principal en la barra superior (escritorio). */
export function NavTop({ role }: { role: StaffRole }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Principal" className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-hidden desk:flex">
      {visibleNav((id) => canAccess(role, id)).filter((item) => item.inTopNav).map((item) => {
        const active = isNavItemActive(item, pathname);
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              focusRing,
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
