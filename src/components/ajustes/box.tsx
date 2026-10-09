import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Tarjeta con cabecera («box» y «box-h» del prototipo). */
export function Box({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("overflow-hidden rounded-2xl border border-black/5 bg-surface shadow-card", className)}>
      <div className="flex min-h-[50px] items-center justify-between gap-2.5 border-b border-line-2 px-4 py-2.5">
        <h2 className="text-[0.95rem]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Texto de ayuda bajo un campo («form-text»). */
export function FieldHint({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1 text-[0.75rem] text-faint">
      {children}
    </p>
  );
}
