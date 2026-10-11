import { Bus, Package, type LucideIcon } from "lucide-react";

import { initials } from "@/lib/domain/resources";
import { cn } from "@/lib/utils";

import type { CrewMember } from "./types";

const ICONS: Record<Exclude<CrewMember["type"], "guide">, LucideIcon> = { vehicle: Bus, equipment: Package };
const MAX = 3;

/** Equipo de la salida en círculos (como el «crew» de FareHarbor): iniciales del guía, icono del resto. */
export function CrewAvatars({ crew, className }: { crew: readonly CrewMember[]; className?: string }) {
  if (!crew.length) return null;
  const shown = crew.slice(0, MAX);
  return (
    <span className={cn("flex items-center gap-0.5", className)}>
      <span className="sr-only">Equipo: {crew.map((member) => member.name).join(", ")}</span>
      {shown.map((member, index) => {
        const Icon = member.type === "guide" ? null : ICONS[member.type];
        return (
          <span
            key={`${member.type}-${member.name}-${index}`}
            aria-hidden="true"
            className={cn(
              "grid size-[22px] flex-none place-items-center rounded-full text-[0.6rem] font-semibold",
              member.type === "guide" ? "bg-primary-soft text-primary-dark" : "bg-[#e8e8ed] text-muted-foreground",
            )}
          >
            {Icon ? <Icon className="size-3" /> : initials(member.name)}
          </span>
        );
      })}
      {crew.length > MAX ? (
        <span aria-hidden="true" className="grid size-[22px] place-items-center rounded-full bg-line-2 text-[0.6rem] font-semibold text-muted-foreground">
          +{crew.length - MAX}
        </span>
      ) : null}
    </span>
  );
}
