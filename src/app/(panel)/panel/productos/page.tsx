import type { Metadata } from "next";
import Link from "next/link";
import { Mountain, Plus } from "lucide-react";

import { ProductCard } from "@/components/productos/product-card";
import { Button } from "@/components/ui/button";
import { requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/db/server";
import { getPublicEnv } from "@/lib/env";
import { minPrice, productPhotoUrl } from "@/lib/domain/product";

export const metadata: Metadata = { title: "Productos" };

export default async function Page() {
  await requireAccess("productos");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, name, color, photo_path, active, duration_min, capacity, product_prices(price_cents), schedule_rules(weekdays, times, language, created_at)",
    )
    .order("created_at")
    .order("name");
  if (error) throw new Error("No se pudieron cargar los productos.");

  const { supabaseUrl } = getPublicEnv();
  const products = data.map((product) => ({
    id: product.id,
    name: product.name,
    color: product.color,
    photoUrl: product.photo_path ? productPhotoUrl(supabaseUrl, product.photo_path) : null,
    active: product.active,
    durationMin: product.duration_min,
    capacity: product.capacity,
    fromCents: minPrice(product.product_prices.map((price) => ({ priceCents: price.price_cents }))),
    rules: product.schedule_rules
      .toSorted((a, b) => a.created_at.localeCompare(b.created_at))
      .map((rule) => ({ weekdays: rule.weekdays, times: rule.times.map((time) => time.slice(0, 5)), language: rule.language })),
  }));
  const activeCount = products.filter((product) => product.active).length;

  return (
    <section className="flex flex-col gap-4 tablet:gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[1.25rem] tablet:text-[1.45rem]">Productos</h1>
          <p className="mt-[3px] text-[0.86rem] text-muted-foreground">
            {activeCount} {activeCount === 1 ? "activo" : "activos"} · cada producto genera sus salidas a partir de sus reglas
            de horario
          </p>
        </div>
        <Button asChild>
          <Link href="/panel/productos/nuevo">
            <Plus aria-hidden="true" />
            Nuevo producto
          </Link>
        </Button>
      </div>
      {products.length ? (
        <ul aria-label="Productos" className="grid grid-cols-[repeat(auto-fill,minmax(min(290px,100%),1fr))] gap-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-black/5 bg-surface px-6 py-12 text-center shadow-card">
          <Mountain className="size-8 text-faint" aria-hidden="true" />
          <b className="font-semibold">Crea tu primer tour</b>
          <span className="text-[0.86rem] text-muted-foreground">
            Con nombre, precio y un horario ya tendrás salidas en el calendario.
          </span>
          <Button asChild size="sm" className="mt-1">
            <Link href="/panel/productos/nuevo">Nuevo producto</Link>
          </Button>
        </div>
      )}
    </section>
  );
}
