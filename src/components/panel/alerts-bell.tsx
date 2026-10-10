"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Campana de avisos de la barra superior, con punto rojo si hay alguno. El recuento llega del servidor
 * (y se renueva con cada revalidatePath del panel) y se vuelve a mirar al cambiar de pantalla.
 */
export function AlertsBell({ initialCount }: { initialCount: number }) {
  const pathname = usePathname();
  const [count, setCount] = useState(initialCount);
  const [serverCount, setServerCount] = useState(initialCount);
  if (serverCount !== initialCount) {
    setServerCount(initialCount);
    setCount(initialCount);
  }

  useEffect(() => {
    const controller = new AbortController();
    fetch("/panel/avisos/recuento", { signal: controller.signal, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: unknown) => {
        const value = (body as { count?: unknown } | null)?.count;
        if (typeof value === "number") setCount(value);
      })
      .catch(() => {
        // Sin red o al cambiar de pantalla: se queda como estaba.
      });
    return () => controller.abort();
  }, [pathname]);

  const label = count ? `Avisos (${count})` : "Avisos";
  return (
    <Button asChild variant="ghost" size="icon" className="relative text-foreground">
      <Link href="/panel/avisos" aria-label={label} aria-current={pathname === "/panel/avisos" ? "page" : undefined}>
        <Bell aria-hidden="true" />
        {count ? <span aria-hidden="true" className="absolute top-2 right-2 size-2 rounded-full bg-danger ring-2 ring-white" /> : null}
        <span className="sr-only" aria-live="polite">
          {count ? `${count} ${count === 1 ? "aviso" : "avisos"}` : ""}
        </span>
      </Link>
    </Button>
  );
}
