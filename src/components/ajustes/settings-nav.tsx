"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, ShieldCheck, Ticket, Users } from "lucide-react";

import { focusRing } from "@/components/panel/styles";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { href: "/panel/ajustes/empresa", label: "Empresa", icon: Building2 },
  { href: "/panel/ajustes/entradas", label: "Tipos de entrada", icon: Ticket },
  { href: "/panel/ajustes/politicas", label: "Venta y cancelación", icon: ShieldCheck },
  { href: "/panel/ajustes/usuarios", label: "Usuarios", icon: Users },
] as const;

/** Secciones de Ajustes: columna en escritorio y fila con scroll horizontal en móvil (setnav del prototipo). */
export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Secciones de ajustes" className="-mx-4 flex gap-0.5 overflow-x-auto px-4 min-[821px]:mx-0 min-[821px]:flex-col min-[821px]:px-0">
      {SECTIONS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              focusRing,
              "flex min-h-11 flex-none items-center gap-2 rounded-[7px] px-2.5 text-[0.86rem] font-medium whitespace-nowrap text-muted-foreground hover:text-foreground tablet:min-h-9",
              active && "bg-surface text-foreground shadow-[0_1px_3px_rgb(0_0_0/0.08)]",
            )}
          >
            <Icon className="size-[18px]" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
