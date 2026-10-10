import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const FEED_TONES = {
  accent: "bg-primary-soft text-primary",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
};

/** Fila con icono de color («feed-item» del prototipo): avisos y actividad reciente. */
export function FeedItem({
  icon: Icon,
  tone,
  children,
}: {
  icon: LucideIcon;
  tone: keyof typeof FEED_TONES;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-2.5 border-b border-line-2 px-4 py-[11px] text-[0.82rem] last:border-b-0">
      <span aria-hidden="true" className={cn("grid size-7 flex-none place-items-center rounded-lg [&_svg]:size-[17px]", FEED_TONES[tone])}>
        <Icon />
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}
