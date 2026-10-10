"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Search } from "lucide-react";

import { Input } from "@/components/ui/input";

/** Búsqueda de clientes: cambia ?q= en la URL tras dejar de escribir. */
export function CustomerSearch({ initial }: { initial: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <div className="relative w-full tablet:w-[260px]">
      <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        aria-label="Buscar cliente"
        placeholder="Buscar cliente"
        value={q}
        maxLength={100}
        className="pl-9"
        onChange={(event) => {
          const value = event.target.value;
          setQ(value);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            const query = value.trim();
            startTransition(() => router.replace(query ? `/panel/clientes?q=${encodeURIComponent(query)}` : "/panel/clientes", { scroll: false }));
          }, 350);
        }}
      />
      {pending ? (
        <LoaderCircle aria-label="Cargando" className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : null}
    </div>
  );
}
