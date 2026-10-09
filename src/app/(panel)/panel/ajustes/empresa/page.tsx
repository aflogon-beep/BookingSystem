import type { Metadata } from "next";

import { Box, FieldHint } from "@/components/ajustes/box";
import { LanguageChips } from "@/components/ajustes/language-chips";
import { SettingInput, SettingSelect } from "@/components/ajustes/setting-field";
import { requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/db/server";
import { CURRENCIES, SETTINGS_LIMITS } from "@/lib/domain/settings";

export const metadata: Metadata = { title: "Empresa · Ajustes" };

export default async function Page() {
  await requireAccess("ajustes");
  const supabase = await createClient();
  const { data: settings, error } = await supabase
    .from("settings")
    .select("business_name, email, phone, currency, default_capacity, languages")
    .eq("id", 1)
    .single();
  if (error) throw new Error("No se pudieron cargar los ajustes.");

  return (
    <Box title="Empresa">
      <div className="grid gap-3.5 p-4 tablet:grid-cols-2">
        <SettingInput
          field="business_name"
          label="Nombre comercial"
          defaultValue={settings.business_name}
          maxLength={SETTINGS_LIMITS.businessName}
          autoComplete="organization"
          className="tablet:col-span-2"
        />
        <SettingInput
          field="email"
          label="Email de reservas"
          type="email"
          inputMode="email"
          autoComplete="email"
          defaultValue={settings.email}
          maxLength={SETTINGS_LIMITS.email}
        />
        <SettingInput
          field="phone"
          label="Teléfono"
          type="tel"
          autoComplete="tel"
          defaultValue={settings.phone}
          maxLength={SETTINGS_LIMITS.phone}
        />
        <SettingSelect field="currency" label="Moneda" defaultValue={settings.currency} options={CURRENCIES} />
        <SettingInput
          field="default_capacity"
          label="Aforo por defecto"
          type="number"
          inputMode="numeric"
          min={SETTINGS_LIMITS.capacity.min}
          max={SETTINGS_LIMITS.capacity.max}
          defaultValue={settings.default_capacity}
          hint="Se propone al crear un producto."
        />
        <div className="flex flex-col gap-1.5 tablet:col-span-2">
          <span id="cf-languages" className="text-[0.8rem] font-medium text-[#2a3644]">
            Idiomas en los que operas
          </span>
          <LanguageChips active={settings.languages} />
          <FieldHint id="cf-languages-hint">Cada salida tiene un idioma, y solo se le asignan guías que lo hablan.</FieldHint>
        </div>
      </div>
    </Box>
  );
}
