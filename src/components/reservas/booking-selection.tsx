"use client";

import { createContext, use, useEffect, useMemo, useState, useTransition } from "react";
import { Check, Download, HandCoins, Minus, UserCheck, X } from "lucide-react";
import { toast } from "sonner";

import { checkInBookings, collectBookings, type BulkResult } from "@/app/(panel)/panel/reservas/bulk-actions";
import type { BookingListRow } from "@/app/(panel)/panel/reservas/list-data";
import { PAYMENT_METHODS } from "@/components/manifiesto/passenger-actions";
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
import { bookingsLabel, bulkResultMessage, bulkSummary, groupState, pruneSelection, toggleGroup } from "@/lib/domain/booking-bulk";
import { bookingsCsv } from "@/lib/domain/booking-list";
import { formatCents } from "@/lib/domain/money";
import { businessToday } from "@/lib/domain/schedule";
import { cn } from "@/lib/utils";

type SelectionContext = {
  selected: ReadonlySet<string>;
  toggle: (codes: readonly string[]) => void;
};

const Context = createContext<SelectionContext>({ selected: new Set(), toggle: () => {} });

const CHECK_IN = { one: "con check-in", many: "con check-in" };
const COLLECTED = { one: "cobrada", many: "cobradas" };

function report(result: BulkResult, verb: { one: string; many: string }): boolean {
  if (!result.ok) {
    toast.error(result.error);
    return false;
  }
  const message = bulkResultMessage(result.done, result.failed, verb);
  if (result.failed) toast.warning(message);
  else toast.success(message);
  return result.done > 0;
}

/**
 * Selección de reservas del listado (como en el correo): se marcan con el avatar de cada fila o el
 * día entero desde su cabecera, y abajo aparece una barra con check-in, cobro y CSV de las
 * marcadas. Esc la vacía.
 */
export function BookingSelectionProvider({ rows, children }: { rows: BookingListRow[]; children: React.ReactNode }) {
  const [marked, setMarked] = useState<ReadonlySet<string>>(new Set());
  const codes = useMemo(() => rows.map((row) => row.code), [rows]);
  // Al cambiar de filtro o de pestaña solo quedan las que se ven.
  const selected = useMemo(() => pruneSelection(marked, codes), [marked, codes]);
  const summary = useMemo(() => bulkSummary(rows, selected), [rows, selected]);
  const value = useMemo(
    () => ({ selected, toggle: (group: readonly string[]) => setMarked((current) => toggleGroup(pruneSelection(current, codes), group)) }),
    [selected, codes],
  );

  useEffect(() => {
    if (!selected.size) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || document.querySelector("[role=dialog]")) return;
      setMarked(new Set());
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected.size]);

  function downloadCsv() {
    const csv = bookingsCsv(rows.filter((row) => selected.has(row.code)));
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `reservas-seleccion-${businessToday()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Context value={value}>
      {children}
      {selected.size ? (
        <>
          {/* Hueco para que la barra no tape las últimas filas. */}
          <div aria-hidden="true" className="h-24 tablet:h-16" />
          <div
            role="region"
            aria-label="Acciones con las reservas marcadas"
            className="fixed inset-x-3 bottom-[calc(72px+env(safe-area-inset-bottom,0px))] z-40 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-4 motion-safe:duration-300 tablet:right-auto tablet:bottom-6 tablet:left-1/2 tablet:-translate-x-1/2 print:hidden"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl tablet:flex-nowrap bg-[#1d1d1f]/92 px-3 py-2.5 text-white shadow-[0_12px_40px_rgb(0_0_0/0.28)] backdrop-blur-xl">
              <p className="mr-auto flex min-w-0 flex-col pl-1 leading-tight" aria-live="polite">
                <b className="text-[0.92rem] font-semibold">{bookingsLabel(summary.count)}</b>
                <span className="text-[0.76rem] whitespace-nowrap text-white/65 tabular-nums">
                  {summary.pax} pax · {formatCents(summary.totalCents)}
                </span>
              </p>
              <BarButton onClick={() => setMarked(new Set())} label="Quitar la selección" icon className="tablet:order-last">
                <X aria-hidden="true" />
              </BarButton>
              {/* En móvil, tres botones iguales con el icono encima; desde tablet, en línea. */}
              <div className="grid w-full grid-cols-3 gap-1.5 tablet:flex tablet:w-auto">
                <CheckInAction ids={summary.checkInIds} />
                <CollectAction ids={summary.collectIds} cents={summary.collectCents} />
                <BarButton onClick={downloadCsv} label="Exportar las marcadas en CSV" stacked>
                  <Download aria-hidden="true" />
                  CSV
                </BarButton>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </Context>
  );
}

function BarButton({
  onClick,
  label,
  icon = false,
  stacked = false,
  disabled = false,
  className,
  children,
}: {
  onClick?: () => void;
  label?: string;
  icon?: boolean;
  /** En móvil, icono encima del texto. */
  stacked?: boolean;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-white/12 text-[0.84rem] font-semibold whitespace-nowrap hover:bg-white/22 focus-visible:ring-[3px] focus-visible:ring-white/40 focus-visible:outline-none disabled:opacity-40 tablet:h-9 [&_svg]:size-4",
        icon ? "w-11 tablet:w-9" : "px-3.5",
        stacked && "max-tablet:h-auto max-tablet:min-h-14 max-tablet:flex-col max-tablet:gap-0.5 max-tablet:rounded-xl max-tablet:px-1.5 max-tablet:py-2 max-tablet:text-[0.74rem]",
        className,
      )}
    >
      {children}
    </button>
  );
}

function CheckInAction({ ids }: { ids: string[] }) {
  const [pending, startTransition] = useTransition();
  return (
    <BarButton
      stacked
      disabled={!ids.length || pending}
      label={ids.length ? `Check-in de ${bookingsLabel(ids.length)}` : "Ninguna marcada está pendiente de llegar"}
      onClick={() =>
        startTransition(async () => {
          report(await checkInBookings(ids), CHECK_IN);
        })
      }
    >
      <UserCheck aria-hidden="true" />
      Check-in{ids.length ? ` (${ids.length})` : ""}
    </BarButton>
  );
}

function CollectAction({ ids, cents }: { ids: string[]; cents: number }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <BarButton
        stacked
        disabled={!ids.length}
        label={ids.length ? `Cobrar ${bookingsLabel(ids.length)}` : "Ninguna marcada tiene el pago pendiente"}
        onClick={() => setOpen(true)}
      >
        <HandCoins aria-hidden="true" />
        Cobrar{ids.length ? ` ${formatCents(cents)}` : ""}
      </BarButton>
      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <span className="text-[0.72rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
              Cobrar {bookingsLabel(ids.length)}
            </span>
            <DialogTitle className="text-[1.6rem] tabular-nums">{formatCents(cents)}</DialogTitle>
            <DialogDescription>Se marcan como pagadas con el mismo medio de pago.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div role="group" aria-label="Cómo pagan" className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      if (report(await collectBookings(ids, value), COLLECTED)) setOpen(false);
                    })
                  }
                  className="flex flex-col items-start gap-1.5 rounded-xl border border-line bg-surface px-3 py-3 text-left font-semibold hover:border-primary disabled:opacity-50"
                >
                  <Icon aria-hidden="true" className="size-5 text-muted-foreground" />
                  {label}
                </button>
              ))}
            </div>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={pending}>
                Cancelar
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Avatar de la fila que, al pulsarlo, marca la reserva (con la marca puesta, enseña un ✓). */
export function SelectAvatar({ code, name, initials }: { code: string; name: string; initials: string }) {
  const { selected, toggle } = use(Context);
  const checked = selected.has(code);
  const selecting = selected.size > 0;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={`Marcar ${name}`}
      onClick={() => toggle([code])}
      className={cn(
        // Por encima del enlace que cubre la fila, con 44 px de zona táctil.
        "group/select relative z-10 grid size-8 flex-none place-items-center rounded-full text-[0.72rem] font-semibold transition-colors before:absolute before:-inset-1.5 before:content-['']",
        "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        checked ? "bg-primary text-white" : "bg-primary-soft text-primary-dark hover:bg-surface hover:ring-2 hover:ring-primary/50",
        !checked && selecting && "bg-surface ring-2 ring-line",
      )}
    >
      {checked ? (
        <Check aria-hidden="true" className="size-4 motion-safe:animate-in motion-safe:zoom-in-50" strokeWidth={3} />
      ) : (
        <span aria-hidden="true" className={cn(selecting ? "invisible" : "group-hover/select:invisible")}>
          {initials}
        </span>
      )}
    </button>
  );
}

/** Casilla de la cabecera de un día: marca o desmarca todas sus reservas. */
export function SelectDay({ codes, label }: { codes: string[]; label: string }) {
  const { selected, toggle } = use(Context);
  const state = groupState(selected, codes);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state}
      aria-label={`Marcar todas las de ${label}`}
      title="Marcar todas las del día"
      onClick={() => toggle(codes)}
      className={cn(
        "relative grid size-[18px] flex-none place-items-center rounded-[5px] border-[1.5px] transition-colors before:absolute before:-inset-3 before:content-['']",
        "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        state ? "border-primary bg-primary text-white" : "border-line bg-surface hover:border-primary",
      )}
    >
      {state === "mixed" ? (
        <Minus aria-hidden="true" className="size-3" strokeWidth={3} />
      ) : state ? (
        <Check aria-hidden="true" className="size-3" strokeWidth={3} />
      ) : null}
    </button>
  );
}
