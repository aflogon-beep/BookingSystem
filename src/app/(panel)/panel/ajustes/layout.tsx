import { SettingsNav } from "@/components/ajustes/settings-nav";
import { requireAccess } from "@/lib/auth";

export default async function AjustesLayout({ children }: LayoutProps<"/panel/ajustes">) {
  await requireAccess("ajustes");

  return (
    <section className="flex flex-col gap-4 tablet:gap-5">
      <div>
        <h1 className="text-[1.25rem] tablet:text-[1.45rem]">Ajustes</h1>
        <p className="mt-[3px] text-[0.86rem] text-muted-foreground">
          Configuración que aplica a todo el negocio. Los cambios se guardan solos.
        </p>
      </div>
      <div className="grid items-start gap-4 min-[821px]:grid-cols-[220px_minmax(0,1fr)] min-[821px]:gap-5">
        <SettingsNav />
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}
