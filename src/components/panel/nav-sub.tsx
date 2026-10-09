"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Store } from "lucide-react";

import { NAV_ICONS } from "@/components/panel/nav-icons";
import { focusRing } from "@/components/panel/styles";
import { canAccess, type StaffRole } from "@/lib/domain/auth";
import { isNavItemActive, visibleNav } from "@/lib/panel-nav";
import { cn } from "@/lib/utils";

/** Navegación en segunda fila con scroll horizontal (tablet). */
export function NavSub({ role }: { role: StaffRole }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);

  // Con scroll horizontal, la sección activa puede quedar fuera de la vista.
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);

  const linkClass =
    "inline-flex items-center gap-1.5 border-b-2 border-transparent px-2.5 py-2.5 text-[0.84rem] font-medium whitespace-nowrap text-muted-foreground hover:text-foreground";

  return (
    <nav
      ref={navRef}
      aria-label="Secciones"
      className="sticky top-14 z-30 hidden overflow-x-auto border-b border-line bg-white/85 px-3 backdrop-blur-xl tablet:flex desk:hidden"
    >
      {visibleNav((id) => canAccess(role, id)).map((item) => {
        const active = isNavItemActive(item, pathname);
        const Icon = NAV_ICONS[item.id];
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(focusRing, linkClass, active && "border-primary text-primary-dark")}
          >
            <Icon className="size-4" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
      <Link href="/" className={cn(focusRing, linkClass)}>
        <Store className="size-4" aria-hidden="true" />
        Web de reservas
      </Link>
    </nav>
  );
}
