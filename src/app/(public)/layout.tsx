import Link from "next/link";
import { Languages, Phone } from "lucide-react";

import { loadSite } from "./data";

/** Web de reservas para clientes: cabecera con el nombre del negocio y contacto, como el prototipo. */
export default async function PublicLayout({ children }: LayoutProps<"/">) {
  const site = await loadSite();
  return (
    <div className="flex min-h-full flex-1 flex-col bg-surface">
      <header className="border-b border-line-2">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2.5 px-4 py-3.5 tablet:px-[22px]">
          <Link href="/" className="text-[1.05rem] font-bold tracking-[-0.02em]">
            {site.businessName}
          </Link>
          <div className="flex items-center gap-3 text-[0.8rem] text-muted-foreground">
            {site.phone ? (
              <a href={`tel:${site.phone.replace(/[^0-9+]/g, "")}`} className="hidden items-center gap-1 hover:text-foreground tablet:inline-flex">
                <Phone aria-hidden="true" className="size-4" />
                {site.phone}
              </a>
            ) : null}
            <span className="inline-flex items-center gap-1" title="Idioma">
              <Languages aria-hidden="true" className="size-4" />
              ES
            </span>
          </div>
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
      <footer className="border-t border-line-2">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap justify-between gap-2 px-4 py-5 text-[0.75rem] text-faint tablet:px-[22px]">
          <span>
            © {new Date().getFullYear()} {site.businessName}
          </span>
          {site.email ? (
            <a href={`mailto:${site.email}`} className="hover:text-foreground">
              {site.email}
            </a>
          ) : null}
        </div>
      </footer>
    </div>
  );
}
