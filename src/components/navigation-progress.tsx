"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

// Barra fina arriba mientras carga la página siguiente. No usamos loading.tsx porque
// rompe los 404 de las fichas (responderían 200 al empezar el streaming).
const START_EVENT = "navigation-progress:start";
// Si la navegación no cambia la URL (error, misma página), la barra no se queda colgada.
const MAX_MS = 10_000;

// Cambios de página dentro de la app desde que se abrió (para «Volver» a la pantalla anterior).
let inAppNavigations = 0;
let lastUrl: string | null = null;

/** true si se ha llegado aquí navegando por la app (no abriendo un enlace o recargando). */
export function hasInAppHistory(): boolean {
  return inAppNavigations > 0;
}

/** Para navegaciones con router.push/replace, que no pasan por un clic en un enlace. */
export function startNavigationProgress() {
  window.dispatchEvent(new Event(START_EVENT));
}

function isNavigationClick(event: MouseEvent): boolean {
  if (event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const anchor = (event.target as Element | null)?.closest?.("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) return false;
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return false;
  // Solo cambia el ancla (#equipo): no hay carga.
  return url.pathname !== window.location.pathname || url.search !== window.location.search;
}

function ProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = `${pathname}?${searchParams.toString()}`;
  // URL desde la que empezó la carga: en cuanto la URL cambia, la barra se apaga sola.
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const active = startedAt === current;

  useEffect(() => {
    if (lastUrl !== null && lastUrl !== current) inAppNavigations += 1;
    lastUrl = current;
  }, [current]);

  useEffect(() => {
    const start = () => setStartedAt(`${window.location.pathname}?${new URLSearchParams(window.location.search).toString()}`);
    const onClick = (event: MouseEvent) => {
      if (isNavigationClick(event)) start();
    };
    window.addEventListener(START_EVENT, start);
    // En captura: <Link> llama a preventDefault para navegar sin recargar.
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener(START_EVENT, start);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => setStartedAt(null), MAX_MS);
    return () => window.clearTimeout(timer);
  }, [active]);

  return (
    <div
      aria-hidden="true"
      data-active={active || undefined}
      className="nav-progress pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]"
    >
      <div className="nav-progress-bar h-full bg-primary" />
    </div>
  );
}

export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <ProgressBar />
    </Suspense>
  );
}
