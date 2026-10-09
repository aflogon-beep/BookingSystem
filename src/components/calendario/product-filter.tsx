"use client";

import { useRouter } from "next/navigation";

import { NativeSelect } from "@/components/ui/native-select";
import { calendarHref, type CalendarView } from "@/lib/domain/calendar";

/** Filtro de producto: cambia la URL para que el calendario se pueda compartir y recargar. */
export function ProductFilter({
  products,
  view,
  anchor,
  productId,
}: {
  products: readonly { id: string; name: string }[];
  view: CalendarView;
  anchor: string;
  productId: string | null;
}) {
  const router = useRouter();
  return (
    <NativeSelect
      aria-label="Producto"
      className="w-full tablet:w-auto tablet:max-w-[210px]"
      value={productId ?? ""}
      onChange={(event) => router.replace(calendarHref({ view, anchor, productId: event.target.value || null }))}
    >
      <option value="">Todos los productos</option>
      {products.map((product) => (
        <option key={product.id} value={product.id}>
          {product.name}
        </option>
      ))}
    </NativeSelect>
  );
}
