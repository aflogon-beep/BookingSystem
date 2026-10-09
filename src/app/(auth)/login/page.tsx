import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/app/(auth)/login/login-form";
import { getCurrentStaff } from "@/lib/auth";
import { safeNextPath } from "@/lib/domain/auth";

export const metadata: Metadata = {
  title: "Entrar · Ruta Reservas",
  robots: { index: false, follow: false },
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const nextPath = safeNextPath(typeof next === "string" ? next : null);

  if (await getCurrentStaff()) redirect(nextPath);

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
            <h1 className="text-[1.45rem]">Ruta Reservas</h1>
            <p className="text-muted-foreground">Entra en el panel de operaciones</p>
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-card">
          <LoginForm next={nextPath} />
        </div>
      </div>
    </main>
  );
}
