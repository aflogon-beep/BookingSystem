import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Pasos de la reserva web (como los asistentes de Amelia): lo hecho con ✓, el actual en azul.
 * `current` empieza en 1; con current mayor que el número de pasos, todos están hechos.
 */
export function BookingSteps({ steps, current, label }: { steps: readonly string[]; current: number; label: string }) {
  return (
    <nav aria-label={label} className="mb-4">
      <ol className="flex items-center gap-2">
        {steps.map((step, index) => {
          const number = index + 1;
          const done = number < current || (number === current && number === steps.length);
          const active = number === current && !done;
          return (
            <li key={step} aria-current={number === current ? "step" : undefined} className="flex min-w-0 flex-1 items-center gap-2 last:flex-none">
              <span
                className={cn(
                  "grid size-7 flex-none place-items-center rounded-full text-[0.78rem] font-semibold transition-colors",
                  done && "bg-ok text-white",
                  active && "bg-primary text-white shadow-[0_0_0_4px_var(--color-primary-soft)]",
                  !done && !active && "border border-line bg-surface text-muted-foreground",
                )}
              >
                {done ? <Check aria-hidden="true" className="size-4" strokeWidth={3} /> : number}
              </span>
              <span
                className={cn(
                  "truncate text-[0.82rem] font-medium",
                  number === current ? "text-foreground" : "text-muted-foreground",
                  // En el móvil solo se lee el paso actual; los demás quedan como círculos.
                  number !== current && "max-tablet:sr-only",
                )}
              >
                {step}
              </span>
              {number < steps.length ? (
                <span aria-hidden="true" className={cn("h-0.5 min-w-4 flex-1 rounded-full", number < current ? "bg-ok" : "bg-line")} />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
