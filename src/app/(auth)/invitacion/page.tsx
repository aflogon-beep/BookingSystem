import type { Metadata } from "next";
import Link from "next/link";

import { AcceptInviteForm } from "@/app/(auth)/invitacion/accept-form";
import { inviteTokenSchema } from "@/lib/domain/team";

export const metadata: Metadata = {
  title: "Invitación · Ruta Reservas",
  robots: { index: false, follow: false },
  // El token va en la URL: que no se filtre a otros sitios en la cabecera Referer.
  referrer: "no-referrer",
};

export default async function InvitationPage({ searchParams }: PageProps<"/invitacion">) {
  const { token } = await searchParams;
  const parsed = inviteTokenSchema.safeParse(token);

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span
            aria-hidden="true"
            className="grid size-12 place-items-center rounded-xl bg-[linear-gradient(160deg,#36a2ff,#0071e3)]"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 19 L10 7 L14 13 L16.5 10 L21 19 Z" />
              <circle cx="17.5" cy="5.5" r="1.6" />
            </svg>
          </span>
          <div>
            <h1 className="text-[1.45rem]">Te damos la bienvenida</h1>
            <p className="text-muted-foreground">Elige tu contraseña para entrar en el panel</p>
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-card">
          {parsed.success ? (
            <AcceptInviteForm token={parsed.data} />
          ) : (
            <div className="flex flex-col gap-4 text-center">
              <p className="text-muted-foreground">
                Este enlace de invitación no es válido. Pide uno nuevo a un administrador.
              </p>
              <Link href="/login" className="font-medium text-primary hover:underline">
                Ir a entrar
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
