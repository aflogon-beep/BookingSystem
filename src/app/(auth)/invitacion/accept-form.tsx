"use client";

import { useActionState } from "react";
import { LoaderCircle } from "lucide-react";

import { acceptInvite, type AcceptInviteState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PASSWORD_MIN_LENGTH } from "@/lib/domain/auth";

export function AcceptInviteForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<AcceptInviteState, FormData>(acceptInvite, { error: null });
  const describedBy = ["password-rules", state.error ? "invite-error" : null].filter(Boolean).join(" ");

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="token" value={token} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={describedBy}
        />
        <p id="password-rules" className="text-[0.75rem] text-faint">
          Al menos {PASSWORD_MIN_LENGTH} caracteres, con mayúsculas, minúsculas y algún número.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmation">Repite la contraseña</Label>
        <Input
          id="confirmation"
          name="confirmation"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "invite-error" : undefined}
        />
      </div>
      {state.error ? (
        <p id="invite-error" role="alert" className="rounded-[10px] bg-danger-soft px-3 py-2 text-[0.85rem] text-danger">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={pending} className="mt-1 w-full">
        {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
        Guardar y entrar
      </Button>
    </form>
  );
}
