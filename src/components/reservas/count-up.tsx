"use client";

import { useEffect, useRef, useState } from "react";

import { formatCents } from "@/lib/domain/money";

const DURATION_MS = 700;

const formats = {
  number: (value: number) => Math.round(value).toLocaleString("es-ES"),
  cents: (value: number) => formatCents(Math.round(value)),
  percent: (value: number) => `${Math.round(value)} %`,
} as const;

/**
 * Cifra que «cuenta» hasta su valor al cargar y cada vez que cambia (al cambiar de filtros sube o baja
 * desde la anterior). Sin animación si el sistema pide reducir el movimiento.
 */
export function CountUp({ value, format = "number" }: { value: number; format?: keyof typeof formats }) {
  const [shown, setShown] = useState(value);
  const from = useRef(0);

  useEffect(() => {
    const start = from.current;
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : DURATION_MS;
    let frame = 0;
    const began = performance.now();
    const tick = (time: number) => {
      const progress = duration ? Math.min(1, Math.max(0, time - began) / duration) : 1;
      // Frena al final (ease-out cúbico).
      const eased = 1 - (1 - progress) ** 3;
      from.current = start + (value - start) * eased;
      setShown(from.current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <span className="tabular-nums">{formats[format](shown)}</span>;
}
