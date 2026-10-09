"use client";

import { useRouter } from "next/navigation";

import { Input } from "@/components/ui/input";

/** Ir a una fecha concreta en «Hoy». */
export function DayPicker({ day }: { day: string }) {
  const router = useRouter();
  return (
    <Input
      key={day}
      type="date"
      aria-label="Ir a fecha"
      className="h-9 w-auto"
      defaultValue={day}
      onChange={(event) => {
        // Al teclear salen años intermedios (0002, 0020…): solo navega con un año completo.
        if (/^20\d{2}-/.test(event.target.value)) router.push(`/panel?fecha=${event.target.value}`);
      }}
    />
  );
}
