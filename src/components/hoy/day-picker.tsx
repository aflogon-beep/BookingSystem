"use client";

import { useRouter } from "next/navigation";

import { Input } from "@/components/ui/input";

/** Ir a una fecha concreta en «Hoy». */
export function DayPicker({ day }: { day: string }) {
  const router = useRouter();
  return (
    <Input
      type="date"
      aria-label="Ir a fecha"
      className="h-9 w-auto"
      value={day}
      onChange={(event) => {
        if (event.target.value) router.push(`/panel?fecha=${event.target.value}`);
      }}
    />
  );
}
