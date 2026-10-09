import Link from "next/link";
import { Clock, Pencil, Tag, Users } from "lucide-react";

import { ActiveSwitch } from "@/components/productos/active-switch";
import { ProductArt } from "@/components/productos/product-art";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { formatCents } from "@/lib/domain/money";
import { durationLabel } from "@/lib/domain/product";
import { daysLabel } from "@/lib/domain/schedule";
import { cn } from "@/lib/utils";

export type ProductCardData = {
  id: string;
  name: string;
  color: string;
  photoUrl: string | null;
  active: boolean;
  durationMin: number;
  capacity: number;
  fromCents: number;
  rules: { weekdays: number[]; times: string[]; language: string }[];
};

export function ProductCard({ product }: { product: ProductCardData }) {
  return (
    <li
      aria-label={product.name}
      className="flex flex-col overflow-hidden rounded-[18px] border border-black/5 bg-surface shadow-card"
    >
      <ProductArt
        seed={product.id}
        color={product.color}
        photoUrl={product.photoUrl}
        className={cn(!product.active && "opacity-60 grayscale")}
      />
      <div className="flex flex-1 flex-col gap-2 px-4 py-3.5">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-[1rem]">{product.name}</h2>
          {product.active ? <Pill tone="ok">Activo</Pill> : <Pill>Inactivo</Pill>}
        </div>
        <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[0.78rem] text-muted-foreground">
          <span className="inline-flex items-center gap-[5px]">
            <Clock className="size-3.5" aria-hidden="true" />
            {durationLabel(product.durationMin)}
          </span>
          <span className="inline-flex items-center gap-[5px]">
            <Users className="size-3.5" aria-hidden="true" />
            {product.capacity} plazas
          </span>
          <span className="inline-flex items-center gap-[5px]">
            <Tag className="size-3.5" aria-hidden="true" />
            desde {formatCents(product.fromCents)}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {product.rules.length ? (
            product.rules.map((rule, index) => (
              <Pill key={index}>
                {daysLabel(rule.weekdays)} · {rule.times.join(", ")} · {rule.language.toUpperCase()}
              </Pill>
            ))
          ) : (
            <Pill tone="warn">Sin horario</Pill>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-line-2 bg-surface-2 px-4 py-2.5">
        <ActiveSwitch id={product.id} name={product.name} active={product.active} />
        <Button asChild variant="outline" size="sm">
          <Link href={`/panel/productos/${product.id}`} aria-label={`Editar ${product.name}`}>
            <Pencil aria-hidden="true" />
            Editar
          </Link>
        </Button>
      </div>
    </li>
  );
}
