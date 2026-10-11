import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Lista vacía: icono, qué pasa y, si toca, el botón para crear lo primero. */
export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  text?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2 px-5 py-9 text-center text-muted-foreground", className)}>
      <span aria-hidden="true" className="grid size-14 place-items-center rounded-full bg-line-2">
        <Icon className="size-7 text-faint" />
      </span>
      <b className="text-foreground">{title}</b>
      {text ? <span className="max-w-[340px] text-[0.86rem]">{text}</span> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
