"use client";

import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { startNavigationProgress } from "@/components/navigation-progress";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { globalSearchHref } from "@/lib/domain/booking-list";

const PLACEHOLDER = "Buscar reserva o cliente";

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * Buscador de la barra superior (como en el prototipo): busca en todas las reservas por código,
 * nombre, teléfono o email. Donde cabe es un campo; si no (móvil, escritorio estrecho), una lupa que lo abre.
 * La tecla «/» lo enfoca desde cualquier pantalla.
 */
export function GlobalSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      event.preventDefault();
      // El campo solo se ve donde cabe en la barra; si no, se abre el diálogo.
      if (inputRef.current && inputRef.current.offsetParent !== null) inputRef.current.focus();
      else setOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const field = event.currentTarget.elements.namedItem("q");
    const query = field instanceof HTMLInputElement ? field.value.trim() : "";
    if (!query) return;
    setOpen(false);
    if (field instanceof HTMLInputElement) field.blur();
    startNavigationProgress();
    router.push(globalSearchHref(query));
  }

  return (
    <>
      <form role="search" onSubmit={submit} className="relative hidden w-[200px] min-[860px]:block desk:hidden min-[1400px]:block">
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          name="q"
          type="search"
          maxLength={100}
          placeholder={PLACEHOLDER}
          aria-label={PLACEHOLDER}
          aria-keyshortcuts="/"
          enterKeyHint="search"
          className="h-9 border-transparent bg-black/[0.05] pl-8 text-[0.82rem] focus-visible:bg-surface tablet:h-9"
        />
      </form>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Buscar"
        className="text-foreground min-[860px]:hidden desk:inline-flex min-[1400px]:hidden"
        onClick={() => setOpen(true)}
      >
        <Search aria-hidden="true" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buscar</DialogTitle>
            <DialogDescription>Código de reserva, nombre, teléfono o email.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <form role="search" onSubmit={submit} className="flex flex-col gap-3">
              <Input name="q" type="search" maxLength={100} autoFocus placeholder={PLACEHOLDER} aria-label={PLACEHOLDER} enterKeyHint="search" />
              <Button type="submit">
                <Search aria-hidden="true" />
                Buscar
              </Button>
            </form>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
