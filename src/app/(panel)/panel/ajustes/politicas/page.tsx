import type { Metadata } from "next";

import { Box } from "@/components/ajustes/box";
import { SettingInput } from "@/components/ajustes/setting-field";
import { requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/db/server";
import { SETTINGS_LIMITS } from "@/lib/domain/settings";

export const metadata: Metadata = { title: "Venta y cancelación · Ajustes" };

export default async function Page() {
  await requireAccess("ajustes");
  const supabase = await createClient();
  const { data: settings, error } = await supabase
    .from("settings")
    .select("cutoff_hours, cancel_hours")
    .eq("id", 1)
    .single();
  if (error) throw new Error("No se pudieron cargar los ajustes.");

  const hours = { type: "number", inputMode: "numeric", min: SETTINGS_LIMITS.hours.min, max: SETTINGS_LIMITS.hours.max } as const;

  return (
    <Box title="Venta y cancelación">
      <div className="grid gap-3.5 p-4 tablet:grid-cols-2">
        <SettingInput
          field="cutoff_hours"
          label="Cierre de venta online"
          suffix="horas antes"
          defaultValue={settings.cutoff_hours}
          hint="La web deja de vender la salida. Desde el panel puedes seguir añadiendo reservas."
          {...hours}
        />
        <SettingInput
          field="cancel_hours"
          label="Cancelación gratuita"
          suffix="horas antes"
          defaultValue={settings.cancel_hours}
          hint="Se muestra al cliente al reservar y en la confirmación."
          {...hours}
        />
      </div>
    </Box>
  );
}
