"use client";

import { useEffect, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Barra fija de móvil para llegar al calendario desde cualquier parte de la ficha. Se esconde
 * mientras el bloque de reservar (`targetId`) está a la vista, para no taparlo.
 */
export function BookBar({ targetId, children }: { targetId: string; children: ReactNode }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setHidden(entry?.isIntersecting ?? false), { threshold: 0 });
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetId]);

  return (
    <div
      inert={hidden}
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 border-t border-line-2 bg-white/94 pb-[env(safe-area-inset-bottom)] backdrop-blur-md transition-transform duration-300 desk:hidden",
        hidden && "translate-y-full",
      )}
    >
      {children}
    </div>
  );
}
