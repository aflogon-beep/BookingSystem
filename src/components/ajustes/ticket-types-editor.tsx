"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { addTicketType, deleteTicketType, saveTicketType } from "@/app/(panel)/panel/ajustes/actions";
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
import { Switch } from "@/components/ui/switch";
import { TICKET_TYPE_LIMITS, type TicketTypeField } from "@/lib/domain/settings";

export type TicketTypeRow = {
  id: string;
  name: string;
  note: string;
  nameEn: string;
  noteEn: string;
  takesSeat: boolean;
  productCount: number;
};

type TextField = "name" | "note" | "name_en" | "note_en";

const ROW_VALUE: Record<TextField, (row: TicketTypeRow) => string> = {
  name: (row) => row.name,
  note: (row) => row.note,
  name_en: (row) => row.nameEn,
  note_en: (row) => row.noteEn,
};

const labelClass = "text-[0.75rem] font-medium text-muted-foreground min-[700px]:sr-only";

function useSave(id: string) {
  const [, startTransition] = useTransition();
  return (field: TicketTypeField, value: string | boolean, onDone?: (ok: boolean) => void) =>
    startTransition(async () => {
      const result = await saveTicketType(id, field, value);
      if (result.ok) toast.success("Ajustes guardados");
      else toast.error(result.error);
      onDone?.(result.ok);
    });
}

function TextCell({
  row,
  field,
  label,
  maxLength,
  showLabel = false,
}: {
  row: TicketTypeRow;
  field: TextField;
  label: string;
  maxLength: number;
  showLabel?: boolean;
}) {
  const save = useSave(row.id);
  const saved = useRef(ROW_VALUE[field](row));
  const [invalid, setInvalid] = useState(false);
  const id = `tt-${field}-${row.id}`;

  function commit(value: string) {
    if (value === saved.current) return;
    save(field, value, (ok) => {
      setInvalid(!ok);
      if (ok) saved.current = value;
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className={showLabel ? "text-[0.75rem] font-medium text-muted-foreground" : labelClass}>
        {label}
      </label>
      <Input
        id={id}
        lang={field.endsWith("_en") ? "en" : undefined}
        data-ticket-name={field === "name" ? row.id : undefined}
        defaultValue={ROW_VALUE[field](row)}
        maxLength={maxLength}
        aria-invalid={invalid || undefined}
        onBlur={(event) => commit(event.currentTarget.value)}
        onKeyDown={(event) => {
          // Enter guarda saliendo del campo: así no se guarda dos veces (Enter y luego blur).
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        className="tablet:h-9"
      />
    </div>
  );
}

function SeatSwitch({ row }: { row: TicketTypeRow }) {
  const save = useSave(row.id);
  const [checked, setChecked] = useState(row.takesSeat);
  const id = `tt-seat-${row.id}`;

  return (
    <div className="flex items-center gap-2 min-[700px]:justify-center">
      <Switch
        id={id}
        checked={checked}
        aria-label={`${row.name}: ocupa plaza`}
        onCheckedChange={(value) => {
          setChecked(value);
          save("takes_seat", value, (ok) => {
            if (!ok) setChecked(!value);
          });
        }}
      />
      <label htmlFor={id} className="text-[0.84rem] text-muted-foreground min-[700px]:sr-only">
        Ocupa plaza
      </label>
    </div>
  );
}

function DeleteButton({ row }: { row: TicketTypeRow }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await deleteTicketType(row.id);
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
          <DialogDescription>
            {row.productCount === 0
              ? "Ningún producto lo vende."
              : `Dejará de venderse en ${row.productCount === 1 ? "1 producto" : `${row.productCount} productos`} y se borrará su precio.`}
          </DialogDescription>
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

export function TicketTypesEditor({ rows }: { rows: TicketTypeRow[] }) {
  const [pending, startTransition] = useTransition();
  const listRef = useRef<HTMLUListElement>(null);
  const previousCount = useRef(rows.length);

  // Al añadir un tipo, deja su nombre seleccionado para escribirlo directamente (como el prototipo).
  useEffect(() => {
    if (rows.length > previousCount.current) {
      const inputs = listRef.current?.querySelectorAll<HTMLInputElement>("input[data-ticket-name]");
      const last = inputs?.[inputs.length - 1];
      last?.focus();
      last?.select();
    }
    previousCount.current = rows.length;
  }, [rows.length]);

  function add() {
    startTransition(async () => {
      const result = await addTicketType();
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <Box
      title="Tipos de entrada"
      action={
        <Button variant="outline" size="sm" onClick={add} disabled={pending}>
          {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
          Añadir
        </Button>
      }
    >
      <div
        aria-hidden="true"
        className="hidden grid-cols-[minmax(150px,1fr)_minmax(180px,1.3fr)_100px_44px] gap-3 border-b border-line-2 px-4 py-2 text-[0.68rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase min-[700px]:grid"
      >
        <span>Nombre</span>
        <span>Condición</span>
        <span className="text-center">Ocupa plaza</span>
        <span />
      </div>
      <ul ref={listRef} aria-label="Tipos de entrada" className="divide-y divide-line-2">
        {rows.map((row) => (
          <li
            key={row.id}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 px-4 py-3 min-[700px]:grid-cols-[minmax(150px,1fr)_minmax(180px,1.3fr)_100px_44px] min-[700px]:items-center min-[700px]:py-2"
          >
            <div className="col-span-2 grid gap-3 min-[700px]:contents">
              <TextCell row={row} field="name" label="Nombre" maxLength={TICKET_TYPE_LIMITS.name} />
              <TextCell row={row} field="note" label="Condición" maxLength={TICKET_TYPE_LIMITS.note} />
            </div>
            <SeatSwitch row={row} />
            <div className="flex justify-end">
              <DeleteButton row={row} />
            </div>
            <div className="col-span-2 grid gap-3 min-[700px]:contents">
              <TextCell row={row} field="name_en" label="Nombre en inglés" maxLength={TICKET_TYPE_LIMITS.name} showLabel />
              <TextCell row={row} field="note_en" label="Condición en inglés" maxLength={TICKET_TYPE_LIMITS.note} showLabel />
            </div>
          </li>
        ))}
      </ul>
      <p className="border-t border-line-2 px-4 py-3 text-[0.75rem] text-faint">
        Desactiva <b className="font-semibold text-muted-foreground">Ocupa plaza</b> en entradas como bebés en brazos: se venden
        pero no restan aforo. El nombre y la condición en inglés se ven en la web en inglés; si los dejas vacíos, en español.
      </p>
    </Box>
  );
}
