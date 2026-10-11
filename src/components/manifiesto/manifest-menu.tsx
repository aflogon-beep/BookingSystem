"use client";

import Link from "next/link";
import { CalendarDays, Copy, Mountain, MoreVertical } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

const itemClass = cn(
  "flex min-h-11 cursor-default items-center gap-2.5 rounded-lg px-3 text-[0.9rem] text-foreground outline-none select-none tablet:min-h-9",
  "data-[highlighted]:bg-line-2 [&_svg]:size-4 [&_svg]:text-muted-foreground",
);

/** Menú «⋮» de la cabecera del manifiesto: acciones secundarias de la salida. */
export function ManifestMenu({ copyText, productId, dayHref }: { copyText: string; productId: string; dayHref: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(copyText);
      toast.success("Manifiesto copiado");
    } catch {
      toast.error("No se pudo copiar. Inténtalo de nuevo.");
    }
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label="Más acciones"
        className="grid size-11 place-items-center rounded-full bg-black/35 text-white backdrop-blur-sm outline-none hover:bg-black/50 focus-visible:ring-2 focus-visible:ring-white tablet:size-9"
      >
        <MoreVertical aria-hidden="true" className="size-5" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-[220px] rounded-xl border border-black/5 bg-surface p-1 shadow-[0_10px_30px_rgb(0_0_0/0.14)]"
        >
          <DropdownMenu.Item className={itemClass} onSelect={copy}>
            <Copy aria-hidden="true" />
            Copiar manifiesto
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild className={itemClass}>
            <Link href={`/panel/productos/${productId}`}>
              <Mountain aria-hidden="true" />
              Ver el producto
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild className={itemClass}>
            <Link href={dayHref}>
              <CalendarDays aria-hidden="true" />
              Ver el resto del día
            </Link>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
