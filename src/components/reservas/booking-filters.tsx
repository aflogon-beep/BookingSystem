"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Search } from "lucide-react";

import { startNavigationProgress } from "@/components/navigation-progress";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { CHANNEL_LABELS } from "@/lib/domain/booking-detail";
import { BOOKING_CHANNELS, PAGE_SIZE, bookingListHref, type BookingListParams } from "@/lib/domain/booking-list";

// Al teclear una fecha salen años intermedios (0002, 0020…): solo cuenta con un año completo.
const dateOrNull = (value: string): string | null => (/^20\d{2}-\d{2}-\d{2}$/.test(value) ? value : null);

/** Búsqueda, producto, canal y fechas del listado de reservas. Cambian la URL (la página se vuelve a pedir). */
export function BookingFilters({ params, products }: { params: BookingListParams; products: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.q);
  // Si la URL cambia desde fuera (atrás, un enlace), la caja de búsqueda se pone al día. Si el
  // cambio es la búsqueda que mandó esta caja, no se toca: el usuario puede seguir escribiendo.
  const [urlQ, setUrlQ] = useState(params.q);
  const [sentQ, setSentQ] = useState(params.q);
  if (urlQ !== params.q) {
    setUrlQ(params.q);
    if (params.q !== sentQ) {
      setQ(params.q);
      setSentQ(params.q);
    }
  }
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Los filtros de la URL más recientes: el temporizador de la búsqueda no debe usar los de un render viejo.
  const latest = useRef(params);
  useEffect(() => {
    latest.current = params;
  }, [params]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function go(next: Partial<BookingListParams>) {
    if (next.q !== undefined) setSentQ(next.q);
    const href = bookingListHref({ ...latest.current, ...next, limit: PAGE_SIZE });
    startNavigationProgress();
    startTransition(() => router.replace(href, { scroll: false }));
  }

  // Un desplegable lleva también lo que haya escrito en la búsqueda y anula el temporizador.
  function goNow(next: Partial<BookingListParams>) {
    if (timer.current) clearTimeout(timer.current);
    go({ q: q.trim(), ...next });
  }

  // Solo navega con una fecha completa, o al borrarla (a medio teclear el valor también es "").
  function dateChanged(input: HTMLInputElement, field: "from" | "to") {
    const value = dateOrNull(input.value);
    if (value) goNow({ [field]: value });
    else if (!input.value && !input.validity.badInput && params[field]) goNow({ [field]: null });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line-2 p-3">
      <div className="relative w-full max-w-[320px]">
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Buscar reservas"
          placeholder="Nombre, email, código, hotel…"
          value={q}
          maxLength={100}
          className="pl-9"
          onChange={(event) => {
            const value = event.target.value;
            setQ(value);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => go({ q: value.trim() }), 350);
          }}
        />
      </div>
      <NativeSelect aria-label="Producto" value={params.productId ?? ""} onChange={(event) => goNow({ productId: event.target.value || null })} className="w-auto">
        <option value="">Todos los productos</option>
        {products.map((product) => (
          <option key={product.id} value={product.id}>
            {product.name}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label="Canal"
        value={params.channel ?? ""}
        onChange={(event) => goNow({ channel: BOOKING_CHANNELS.find((channel) => channel === event.target.value) ?? null })}
        className="w-auto"
      >
        <option value="">Todos los canales</option>
        {BOOKING_CHANNELS.map((channel) => (
          <option key={channel} value={channel}>
            {CHANNEL_LABELS[channel]}
          </option>
        ))}
      </NativeSelect>
      <div role="group" aria-label="Fechas de salida" className="flex items-center gap-1.5 max-tablet:w-full">
        <Input
          type="date"
          aria-label="Desde"
          title="Salidas desde"
          key={params.from ?? ""}
          defaultValue={params.from ?? ""}
          onChange={(event) => dateChanged(event.target, "from")}
          className="w-auto min-w-0 max-tablet:flex-1 tablet:w-[150px]"
        />
        <span aria-hidden="true" className="text-muted-foreground">–</span>
        <Input
          type="date"
          aria-label="Hasta"
          title="Salidas hasta"
          key={params.to ?? ""}
          defaultValue={params.to ?? ""}
          onChange={(event) => dateChanged(event.target, "to")}
          className="w-auto min-w-0 max-tablet:flex-1 tablet:w-[150px]"
        />
      </div>
      {pending ? <LoaderCircle aria-label="Cargando" className="size-4 animate-spin text-muted-foreground" /> : null}
    </div>
  );
}
