import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Etiqueta redondeada («pill» del prototipo). Con punto salvo en el tono neutro. */
export function Pill({
  tone = "neutral",
  mono = false,
  className,
  children,
}: {
  tone?: "ok" | "warn" | "neutral";
  mono?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[5px] rounded-full px-2 py-0.5 text-[0.72rem] leading-normal font-semibold whitespace-nowrap",
        tone !== "neutral" && "before:size-1.5 before:rounded-full before:bg-current before:opacity-85",
        tone === "ok" && "bg-ok-soft text-ok",
        tone === "warn" && "bg-warn-soft text-warn",
        tone === "neutral" && "bg-line-2 text-muted-foreground",
        mono && "font-mono font-medium tabular-nums",
        className,
      )}
    >
      {children}
    </span>
  );
}
