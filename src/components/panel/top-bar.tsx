import Link from "next/link";
import { LogOut, Plus, Settings, Store } from "lucide-react";

import { logout } from "@/app/(auth)/actions";

import { NavTop } from "@/components/panel/nav-top";
import { focusRing } from "@/components/panel/styles";
import { Button } from "@/components/ui/button";
import type { StaffMember } from "@/lib/auth";
import { canAccess } from "@/lib/domain/auth";
import { NEW_BOOKING_HREF } from "@/lib/panel-nav";

function Logo() {
  return (
    <span
      aria-hidden="true"
      className="grid size-[30px] flex-none place-items-center rounded-lg bg-[linear-gradient(160deg,#36a2ff,#0071e3)]"
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 19 L10 7 L14 13 L16.5 10 L21 19 Z" />
        <circle cx="17.5" cy="5.5" r="1.6" />
      </svg>
    </span>
  );
}

export function TopBar({ staff }: { staff: StaffMember }) {
  return (
    <header className="sticky top-0 z-40 flex min-h-[calc(54px+env(safe-area-inset-top,0px))] pt-[env(safe-area-inset-top,0px)] items-center gap-x-[18px] border-b border-black/[0.08] bg-white/78 px-3.5 backdrop-blur-xl backdrop-saturate-180 tablet:min-h-[calc(56px+env(safe-area-inset-top,0px))] tablet:px-[18px]">
      <Link href="/panel" className={`${focusRing} flex min-w-0 flex-none items-center gap-2.5 rounded-lg`}>
        <Logo />
        <span className="min-w-0 leading-tight">
          <b className="block text-[0.92rem] font-semibold text-foreground">Ruta Reservas</b>
          <small className="hidden text-[0.7rem] text-muted-foreground min-[1320px]:block">Panel de operaciones</small>
        </span>
      </Link>

      <NavTop role={staff.role} />

      <div className="ml-auto flex flex-none items-center gap-1">
        <Button asChild size="sm" className="hidden tablet:inline-flex">
          <Link href={NEW_BOOKING_HREF}>
            <Plus aria-hidden="true" />
            Nueva reserva
          </Link>
        </Button>
        <Button asChild variant="ghost" size="icon" className="hidden text-foreground tablet:inline-flex">
          <Link href="/" aria-label="Web de reservas" title="Web de reservas">
            <Store aria-hidden="true" />
          </Link>
        </Button>
        {canAccess(staff.role, "ajustes") ? (
          <Button asChild variant="ghost" size="icon" className="hidden text-foreground tablet:inline-flex">
            <Link href="/panel/ajustes" aria-label="Ajustes" title="Ajustes">
              <Settings aria-hidden="true" />
            </Link>
          </Button>
        ) : null}
        <form action={logout} className="hidden tablet:block">
          <Button type="submit" variant="ghost" size="sm" title={`Salir (${staff.name})`}>
            <LogOut aria-hidden="true" />
            Salir
          </Button>
        </form>
      </div>
    </header>
  );
}
