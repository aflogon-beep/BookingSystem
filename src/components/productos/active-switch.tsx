"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { setProductActive } from "@/app/(panel)/panel/productos/actions";
import { Switch } from "@/components/ui/switch";

/** Interruptor «A la venta» de la tarjeta de producto. */
export function ActiveSwitch({ id, name, active }: { id: string; name: string; active: boolean }) {
  const [checked, setChecked] = useState(active);
  const [pending, startTransition] = useTransition();
  const switchId = `pa-${id}`;

  return (
    <div className="flex items-center gap-2">
      <Switch
        id={switchId}
        checked={checked}
        disabled={pending}
        aria-label={`${name}: a la venta`}
        onCheckedChange={(value) => {
          setChecked(value);
          startTransition(async () => {
            const result = await setProductActive(id, value);
            if (result.ok) toast.success(value ? `«${name}» a la venta` : `«${name}» retirado de la venta`);
            else {
              setChecked(!value);
              toast.error(result.error);
            }
          });
        }}
      />
      <label htmlFor={switchId} className="text-[0.8rem] text-muted-foreground">
        A la venta
      </label>
    </div>
  );
}
