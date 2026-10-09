"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Bus, LoaderCircle, Package, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { addResource, deleteResource, saveResource, toggleResourceLanguage } from "@/app/(panel)/panel/equipo/actions";
import { focusRing } from "@/components/panel/styles";
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
import {
  RESOURCE_LIMITS,
  RESOURCE_TYPE_TEXT,
  initials,
  weeklySessionsLabel,
  type ResourceField,
  type ResourceType,
} from "@/lib/domain/resources";
import { LANGUAGE_CODES, LANGUAGES } from "@/lib/domain/settings";
import { cn } from "@/lib/utils";

export type ResourceRow = { id: string; name: string; seats: number; languages: string[]; weeklySessions: number };

function useSave(id: string) {
  const [, startTransition] = useTransition();
  return (field: ResourceField, value: string, onDone: (ok: boolean) => void) =>
    startTransition(async () => {
      const result = await saveResource(id, field, value);
      if (result.ok) toast.success("Guardado");
      else toast.error(result.error);
      onDone(result.ok);
    });
}

/** Campo que se guarda solo al salir de él (o con Enter), como en Ajustes. */
function AutoSaveInput({
  row,
  field,
  label,
  initial,
  className,
  ...props
}: {
  row: ResourceRow;
  field: ResourceField;
  label: string;
  initial: string;
  className?: string;
} & Omit<React.ComponentProps<typeof Input>, "defaultValue" | "onBlur" | "onKeyDown" | "aria-label">) {
  const save = useSave(row.id);
  const saved = useRef(initial);
  const [invalid, setInvalid] = useState(false);

  function commit(value: string) {
    if (value === saved.current) return;
    save(field, value, (ok) => {
      setInvalid(!ok);
      if (ok) saved.current = value;
    });
  }

  return (
    <Input
      {...props}
      aria-label={label}
      defaultValue={initial}
      aria-invalid={invalid || undefined}
      onBlur={(event) => commit(event.currentTarget.value)}
      onKeyDown={(event) => {
        // Enter guarda saliendo del campo: así no se guarda dos veces (Enter y luego blur).
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      className={className}
    />
  );
}

function GuideLanguages({ row, languages }: { row: ResourceRow; languages: readonly string[] }) {
  const [pending, startTransition] = useTransition();
  const labelId = `rl-${row.id}`;
  // Los idiomas de Ajustes, más los que el guía ya tenga y ya no estén (para poder quitarlos).
  const options = LANGUAGE_CODES.filter((code) => languages.includes(code) || row.languages.includes(code));

  function toggle(code: string) {
    startTransition(async () => {
      const result = await toggleResourceLanguage(row.id, code);
      if (result.ok) toast.success("Guardado");
      else toast.error(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="text-[0.75rem] font-medium text-muted-foreground">
        Idiomas que guía
      </span>
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-1">
        {options.map((code) => {
          const on = row.languages.includes(code);
          return (
            <button
              key={code}
              type="button"
              aria-pressed={on}
              aria-label={LANGUAGES[code]}
              title={LANGUAGES[code]}
              disabled={pending}
              onClick={() => toggle(code)}
              className={cn(
                focusRing,
                "min-h-10 min-w-11 rounded-full border px-2.5 font-mono text-[0.76rem] font-medium tablet:min-h-8 tablet:min-w-9",
                "disabled:cursor-wait",
                on ? "border-[#b3d4f7] bg-primary-soft text-primary-dark" : "border-line bg-surface text-muted-foreground hover:text-foreground",
              )}
            >
              {code.toUpperCase()}
            </button>
          );
        })}
      </div>
      {row.languages.length === 0 ? (
        <span className="text-[0.75rem] text-warn">Sin idiomas no se le asignará ninguna salida.</span>
      ) : null}
    </div>
  );
}

function DeleteResource({ row }: { row: ResourceRow }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await deleteResource(row.id);
      if (result.ok) {
        setOpen(false);
        toast.success(`«${row.name}» eliminado`);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="icon" aria-label={`Eliminar ${row.name}`} onClick={() => setOpen(true)}>
        <Trash2 aria-hidden="true" />
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Eliminar «{row.name}»?</DialogTitle>
          <DialogDescription>Se quitará a {row.name} de todas las salidas donde esté asignado.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <p className="text-[0.86rem] text-muted-foreground">No se puede deshacer.</p>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button variant="destructive" onClick={confirm} disabled={pending}>
            {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
            Eliminar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResourceCard({ type, row, languages }: { type: ResourceType; row: ResourceRow; languages: readonly string[] }) {
  const seatsLabel = RESOURCE_TYPE_TEXT[type].seatsLabel;
  const Icon = type === "vehicle" ? Bus : Package;

  return (
    <li
      aria-label={row.name}
      className="flex flex-col gap-3 rounded-[18px] border border-black/5 bg-surface px-4 py-3.5 shadow-card"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 flex-none place-items-center rounded-full bg-primary-soft text-[0.84rem] font-semibold text-primary-dark"
        >
          {type === "guide" ? initials(row.name) : <Icon className="size-5" />}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <AutoSaveInput
            row={row}
            field="name"
            label="Nombre"
            initial={row.name}
            maxLength={RESOURCE_LIMITS.name}
            data-resource-name={row.id}
            className="h-9 border-transparent px-2 font-semibold shadow-none hover:border-input"
          />
          <span className="px-2 text-[0.78rem] text-muted-foreground">{weeklySessionsLabel(row.weeklySessions)}</span>
        </div>
        <DeleteResource row={row} />
      </div>
      {type === "guide" ? <GuideLanguages row={row} languages={languages} /> : null}
      {seatsLabel ? (
        <label className="flex items-center gap-2.5 text-[0.84rem] text-muted-foreground">
          {seatsLabel}
          <AutoSaveInput
            row={row}
            field="seats"
            label={seatsLabel}
            initial={String(row.seats)}
            type="number"
            inputMode="numeric"
            min={RESOURCE_LIMITS.seats.min}
            max={RESOURCE_LIMITS.seats.max}
            className="w-[90px] tabular-nums"
          />
        </label>
      ) : null}
    </li>
  );
}

/** Botón «Añadir guía / vehículo / equipo». */
export function AddResourceButton({ type, label, size }: { type: ResourceType; label?: string; size?: "sm" }) {
  const [pending, startTransition] = useTransition();

  function add() {
    startTransition(async () => {
      const result = await addResource(type);
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <Button onClick={add} disabled={pending} size={size}>
      {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
      {label ?? `Añadir ${RESOURCE_TYPE_TEXT[type].singular}`}
    </Button>
  );
}

export function ResourceList({ type, rows, languages }: { type: ResourceType; rows: ResourceRow[]; languages: string[] }) {
  const listRef = useRef<HTMLUListElement>(null);
  const previousCount = useRef(rows.length);
  const text = RESOURCE_TYPE_TEXT[type];

  // Al añadir un recurso, deja su nombre seleccionado para escribirlo directamente (como el prototipo).
  useEffect(() => {
    if (rows.length > previousCount.current) {
      const inputs = listRef.current?.querySelectorAll<HTMLInputElement>("input[data-resource-name]");
      const last = inputs?.[inputs.length - 1];
      last?.focus();
      last?.select();
    }
    previousCount.current = rows.length;
  }, [rows.length]);

  return rows.length ? (
    <ul ref={listRef} aria-label={text.plural} className="grid grid-cols-[repeat(auto-fill,minmax(min(290px,100%),1fr))] gap-4">
      {rows.map((row) => (
        <ResourceCard key={row.id} type={type} row={row} languages={languages} />
      ))}
    </ul>
  ) : (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-black/5 bg-surface px-6 py-12 text-center shadow-card">
      <b className="font-semibold">No hay {text.plural.toLowerCase()}</b>
      <AddResourceButton type={type} label="Añadir" size="sm" />
    </div>
  );
}
