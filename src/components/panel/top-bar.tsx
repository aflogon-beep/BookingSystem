import Link from "next/link";
import { Plus, Settings, Store } from "lucide-react";

import { NavTop } from "@/components/panel/nav-top";
import { Button } from "@/components/ui/button";
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

export function TopBar() {
  return (
    <header className="sticky top-0 z-40 flex min-h-[54px] items-center gap-x-[18px] border-b border-black/[0.08] bg-white/78 px-3.5 backdrop-blur-xl backdrop-saturate-180 tablet:min-h-14 tablet:px-[18px]">
      <Link href="/panel" className="flex min-w-0 flex-none items-center gap-2.5 rounded-lg">
        <Logo />
        <span className="min-w-0 leading-tight">
          <b className="block text-[0.92rem] font-semibold text-foreground">Ruta Reservas</b>
          <small className="hidden text-[0.7rem] text-muted-foreground tablet:block">Panel de operaciones</small>
        </span>
      </Link>

      <NavTop />

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
        <Button asChild variant="ghost" size="icon" className="hidden text-foreground tablet:inline-flex">
          <Link href="/panel/ajustes" aria-label="Ajustes" title="Ajustes">
            <Settings aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </header>
  );
}
