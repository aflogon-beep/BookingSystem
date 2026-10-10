import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles } from "lucide-react";

import { Box, FieldHint } from "@/components/ajustes/box";
import { LanguageChips } from "@/components/ajustes/language-chips";
import { SettingInput, SettingSelect } from "@/components/ajustes/setting-field";
import { Button } from "@/components/ui/button";
import { requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/db/server";
import { CURRENCIES, SETTINGS_LIMITS } from "@/lib/domain/settings";

export const metadata: Metadata = { title: "Empresa · Ajustes" };

export default async function Page() {
  await requireAccess("ajustes");
  const supabase = await createClient();
  const { data: settings, error } = await supabase
    .from("settings")
    .select("business_name, email, phone, currency, default_capacity, languages, legal_name, tax_id, address, registry_info, tourism_registry")
    .eq("id", 1)
    .single();
  if (error) throw new Error("No se pudieron cargar los ajustes.");

  return (
    <Box
      title="Empresa"
      action={
        <Button asChild variant="outline" size="sm">
          <Link href="/panel/asistente">
            <Sparkles aria-hidden="true" />
            Asistente
          </Link>
        </Button>
      }
    >
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
      <div className="grid gap-3.5 border-t border-line-2 p-4 tablet:grid-cols-2">
        <p className="text-[0.8rem] text-muted-foreground tablet:col-span-2">
          Datos del titular. Salen en la política de privacidad y en el aviso legal de la web.
        </p>
        {!settings.legal_name.trim() || !settings.tax_id.trim() ? (
          <p role="status" className="rounded-[10px] bg-warn-soft px-3 py-2 text-[0.8rem] text-warn tablet:col-span-2">
            Falta la razón social o el NIF: la ley pide que salgan en el aviso legal de la web.
          </p>
        ) : null}
        <SettingInput
          field="legal_name"
          label="Razón social"
          defaultValue={settings.legal_name}
          maxLength={SETTINGS_LIMITS.legalName}
          placeholder="Volcán Tours S.L."
        />
        <SettingInput field="tax_id" label="NIF / CIF" defaultValue={settings.tax_id} maxLength={SETTINGS_LIMITS.taxId} />
        <SettingInput
          field="address"
          label="Dirección"
          autoComplete="street-address"
          defaultValue={settings.address}
          maxLength={SETTINGS_LIMITS.address}
          className="tablet:col-span-2"
        />
        <SettingInput
          field="registry_info"
          label="Registro Mercantil"
          defaultValue={settings.registry_info}
          maxLength={SETTINGS_LIMITS.registryInfo}
          placeholder="Tomo, folio, hoja e inscripción"
          hint="Solo si eres una sociedad."
        />
        <SettingInput
          field="tourism_registry"
          label="Registro turístico de Canarias"
          defaultValue={settings.tourism_registry}
          maxLength={SETTINGS_LIMITS.tourismRegistry}
          hint="Número de inscripción como empresa de actividades turísticas."
        />
      </div>
    </Box>
  );
}
