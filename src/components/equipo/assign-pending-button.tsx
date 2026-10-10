"use client";

import { useTransition } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { assignPending } from "@/app/(panel)/panel/equipo/actions";
import { Button } from "@/components/ui/button";

/** «Asignar pendientes»: rellena el equipo de las salidas del día con reservas y huecos. */
export function AssignPendingButton({ day }: { day: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await assignPending(day);
          if (result.ok) toast.success(result.message);
          else toast.error(result.message);
        })
      }
    >
      <Sparkles aria-hidden="true" />
      Asignar pendientes
    </Button>
  );
}
