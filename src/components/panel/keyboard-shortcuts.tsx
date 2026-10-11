"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { startNavigationProgress } from "@/components/navigation-progress";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NEW_BOOKING_HREF } from "@/lib/panel-nav";

export type Shortcut = { key: string; label: string; href: string };

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * Atajos de teclado del panel (como FareHarbor), para la oficina: una tecla y vas. «?» enseña la
 * lista. No hacen nada mientras se escribe en un campo ni con un diálogo abierto.
 */
export function KeyboardShortcuts({ sections }: { sections: Shortcut[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const shortcuts: Shortcut[] = [{ key: "n", label: "Nueva reserva", href: NEW_BOOKING_HREF }, ...sections];

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat || isTyping(event.target)) return;
      if (document.querySelector("[role=dialog], [role=menu]")) return;
      if (event.key === "?") {
        event.preventDefault();
        setOpen(true);
        return;
      }
      const shortcut = shortcuts.find((item) => item.key === event.key.toLowerCase() && !event.shiftKey);
      if (!shortcut) return;
      event.preventDefault();
      startNavigationProgress();
      router.push(shortcut.href);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Atajos de teclado</DialogTitle>
          <DialogDescription>Funcionan en cualquier pantalla del panel, cuando no estás escribiendo.</DialogDescription>
        </DialogHeader>
        <DialogBody className="pb-6">
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2.5 text-[0.9rem]">
            {[{ key: "/", label: "Buscar reserva o cliente" }, ...shortcuts, { key: "?", label: "Ver esta lista" }].map((item) => (
              <div key={item.key} className="contents">
                <dt>
                  <kbd className="inline-grid min-w-7 place-items-center rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[0.8rem] font-semibold uppercase shadow-[inset_0_-1px_0_rgb(0_0_0/0.08)]">
                    {item.key}
                  </kbd>
                </dt>
                <dd>{item.label}</dd>
              </div>
            ))}
          </dl>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
