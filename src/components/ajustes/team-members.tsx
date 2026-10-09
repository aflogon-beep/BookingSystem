"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Copy, Link2, LoaderCircle, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import {
  changeMemberRole,
  inviteMember,
  regenerateInvite,
  removeMember,
} from "@/app/(panel)/panel/ajustes/usuarios/actions";
import { Box } from "@/components/ajustes/box";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { avatarColor, initials } from "@/lib/avatar";
import type { StaffRole } from "@/lib/domain/auth";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type MemberStatus } from "@/lib/domain/team";
import { cn } from "@/lib/utils";

export type MemberRow = {
  userId: string;
  name: string;
  email: string;
  role: StaffRole;
  status: MemberStatus;
  isSelf: boolean;
};

const ROLES: StaffRole[] = ["admin", "staff"];

function Pill({ tone, children }: { tone: "ok" | "warn" | "neutral"; children: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[5px] rounded-full px-2 py-0.5 text-[0.72rem] leading-normal font-semibold whitespace-nowrap",
        "before:size-1.5 before:rounded-full before:bg-current before:opacity-85",
        tone === "ok" && "bg-ok-soft text-ok",
        tone === "warn" && "bg-warn-soft text-warn",
        tone === "neutral" && "bg-line-2 text-muted-foreground before:hidden",
      )}
    >
      {children}
    </span>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-[38px] flex-none place-items-center rounded-full text-[0.82rem] font-semibold text-white"
      style={{ background: avatarColor(name) }}
    >
      {initials(name)}
    </span>
  );
}

/** Enlace de invitación listo para copiar y enviar. */
function InviteLink({ url, name }: { url: string; name: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Enlace copiado");
    } catch {
      toast.error("No se pudo copiar. Selecciona el enlace y cópialo a mano.");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="invite-url">Enlace de invitación para {name}</Label>
      <Input id="invite-url" readOnly value={url} onFocus={(event) => event.currentTarget.select()} className="font-mono text-[0.8rem]" />
      <p className="text-[0.75rem] text-faint">
        Envíaselo por WhatsApp o email. Al abrirlo elegirá su contraseña. Caduca pronto y solo sirve una vez: si no le llega a
        tiempo, genera otro desde la lista.
      </p>
      <Button type="button" onClick={copy} className="self-start">
        <Copy aria-hidden="true" />
        Copiar enlace
      </Button>
    </div>
  );
}

function InviteDialog() {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ url: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setResult(null);
      setError(null);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      role: String(form.get("role") ?? ""),
    };
    startTransition(async () => {
      const response = await inviteMember(input);
      if (response.ok) {
        setError(null);
        setResult({ url: response.url, name: input.name.trim() });
        toast.success(`${input.name.trim()} invitado`);
      } else {
        setError(response.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Button size="sm" onClick={() => setOpen(true)}>
        <UserPlus aria-hidden="true" />
        Invitar
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{result ? "Invitación creada" : "Invitar al panel"}</DialogTitle>
          <DialogDescription>
            {result ? "Ya aparece en la lista como pendiente." : "Recibirá un enlace para elegir su contraseña."}
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <>
            <DialogBody>
              <InviteLink url={result.url} name={result.name} />
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Hecho</Button>
              </DialogClose>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} noValidate className="flex flex-1 flex-col">
            <DialogBody>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="invite-name">Nombre</Label>
                <Input id="invite-name" name="name" autoComplete="off" maxLength={120} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="invite-email">Email</Label>
                <Input id="invite-email" name="email" type="email" inputMode="email" autoComplete="off" maxLength={254} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="invite-role">Rol</Label>
                <NativeSelect id="invite-role" name="role" defaultValue="staff" aria-describedby="invite-role-hint">
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </NativeSelect>
                <p id="invite-role-hint" className="text-[0.75rem] text-faint">
                  {ROLE_LABELS.admin}: {ROLE_DESCRIPTIONS.admin.toLowerCase()} {ROLE_LABELS.staff}:{" "}
                  {ROLE_DESCRIPTIONS.staff.toLowerCase()}
                </p>
              </div>
              {error ? (
                <p role="alert" className="rounded-[10px] bg-danger-soft px-3 py-2 text-[0.85rem] text-danger">
                  {error}
                </p>
              ) : null}
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" disabled={pending}>
                {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
                Crear invitación
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function NewLinkButton({ member }: { member: MemberRow }) {
  const [url, setUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function generate() {
    startTransition(async () => {
      const result = await regenerateInvite(member.userId);
      if (result.ok) setUrl(result.url);
      else toast.error(result.error);
    });
  }

  return (
    <Dialog open={url !== null} onOpenChange={(open) => !open && setUrl(null)}>
      <Button variant="outline" size="sm" onClick={generate} disabled={pending} aria-label={`Enlace nuevo para ${member.name}`}>
        {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Link2 aria-hidden="true" />}
        Enlace
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enlace nuevo</DialogTitle>
          <DialogDescription>Los enlaces anteriores de {member.name} dejan de funcionar.</DialogDescription>
        </DialogHeader>
        <DialogBody>{url ? <InviteLink url={url} name={member.name} /> : null}</DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Hecho</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RoleSelect({ member }: { member: MemberRow }) {
  const [role, setRole] = useState(member.role);
  const [pending, startTransition] = useTransition();
  const id = `role-${member.userId}`;

  function change(next: StaffRole) {
    const previous = role;
    setRole(next);
    startTransition(async () => {
      const result = await changeMemberRole(member.userId, next);
      if (result.ok) {
        toast.success(`${member.name} ahora es ${ROLE_LABELS[next].toLowerCase()}`);
      } else {
        setRole(previous);
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="sr-only">
        Rol de {member.name}
      </label>
      <NativeSelect
        id={id}
        value={role}
        disabled={member.isSelf || pending}
        title={member.isSelf ? "No puedes cambiar tu propio rol" : undefined}
        onChange={(event) => change(event.currentTarget.value === "admin" ? "admin" : "staff")}
        className="w-full min-[700px]:w-[170px]"
      >
        {ROLES.map((option) => (
          <option key={option} value={option}>
            {ROLE_LABELS[option]}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

function RemoveButton({ member }: { member: MemberRow }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await removeMember(member.userId);
      if (result.ok) {
        setOpen(false);
        toast.success(`${member.name} dado de baja`);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="icon" aria-label={`Dar de baja a ${member.name}`} onClick={() => setOpen(true)}>
        <Trash2 aria-hidden="true" />
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Dar de baja a {member.name}?</DialogTitle>
          <DialogDescription>Perderá el acceso al panel al momento y se borrará su cuenta.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <p className="text-[0.86rem] text-muted-foreground">Si vuelve, podrás invitarle de nuevo con el mismo email.</p>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button variant="destructive" onClick={confirm} disabled={pending}>
            {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
            Dar de baja
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TeamMembers({ members }: { members: MemberRow[] }) {
  return (
    <Box title="Usuarios del panel" action={<InviteDialog />}>
      <ul aria-label="Usuarios del panel" className="divide-y divide-line-2">
        {members.map((member) => (
          <li
            key={member.userId}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5 px-4 py-3 min-[700px]:grid-cols-[minmax(0,1fr)_auto_auto_44px]"
          >
            <div className="flex min-w-0 items-center gap-3">
              <Avatar name={member.name} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <b className="truncate font-semibold">{member.name}</b>
                  {member.isSelf ? <Pill tone="neutral">Tú</Pill> : null}
                  {member.status === "pending" ? <Pill tone="warn">Invitación pendiente</Pill> : null}
                </div>
                <p className="truncate text-[0.8rem] text-muted-foreground">{member.email}</p>
              </div>
            </div>
            <div className="flex justify-end">{member.status === "pending" ? <NewLinkButton member={member} /> : null}</div>
            <RoleSelect member={member} />
            <div className="flex justify-end">{member.isSelf ? null : <RemoveButton member={member} />}</div>
          </li>
        ))}
      </ul>
      <p className="border-t border-line-2 px-4 py-3 text-[0.75rem] text-faint">
        <b className="font-semibold text-muted-foreground">{ROLE_LABELS.admin}</b>: {ROLE_DESCRIPTIONS.admin.toLowerCase()}{" "}
        <b className="font-semibold text-muted-foreground">{ROLE_LABELS.staff}</b>: {ROLE_DESCRIPTIONS.staff.toLowerCase()}
      </p>
    </Box>
  );
}
