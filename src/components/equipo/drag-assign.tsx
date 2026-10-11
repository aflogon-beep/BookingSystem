"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { setSessionResources } from "@/app/(panel)/panel/salidas/actions";
import { dropVerdict, resourceIdsAfterDrop, type DaySession, type DropResource } from "@/lib/domain/whereabouts";

type Drag = { sessionId: string; fromId: string | null };

/**
 * Arrastrar y soltar en la línea de tiempo de Equipo: coge una salida y suéltala en la fila de un
 * guía o vehículo para asignársela (o en «Sin asignar» para quitarla). Al arrastrar, cada fila se
 * pinta de verde (libre), ámbar (se puede, con aviso) o rojo (ocupado a esa hora). La base de datos
 * vuelve a comprobar los solapes al guardar; el aviso trae «Deshacer».
 *
 * Los bloques llevan data-session y data-from; las filas, data-drop (id del recurso o «none»).
 */
export function DragAssign({
  sessions,
  resources,
  enabled,
  children,
}: {
  sessions: DaySession[];
  resources: DropResource[];
  enabled: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [, startTransition] = useTransition();
  const byId = useMemo(() => new Map(resources.map((resource) => [resource.id, resource])), [resources]);
  const sessionById = useMemo(() => new Map(sessions.map((session) => [session.id, session])), [sessions]);

  const verdicts = useMemo(() => {
    const session = drag ? sessionById.get(drag.sessionId) : undefined;
    if (!session || !drag) return null;
    const map = new Map(resources.map((resource) => [resource.id, dropVerdict(session, resource, sessions)]));
    map.set("none", drag.fromId ? { kind: "ok", text: "Quitar de la salida" } : { kind: "same", text: "" });
    return map;
  }, [drag, resources, sessions, sessionById]);

  // Pinta cada fila según lo que pasaría al soltar ahí.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const rows = root.querySelectorAll<HTMLElement>("[data-drop]");
    for (const row of rows) {
      const verdict = verdicts?.get(row.dataset.drop ?? "");
      if (verdict) {
        row.dataset.verdict = verdict.kind;
        row.dataset.verdictText = verdict.text;
      } else {
        delete row.dataset.verdict;
        delete row.dataset.verdictText;
        delete row.dataset.over;
      }
    }
  }, [verdicts]);

  if (!enabled) return <>{children}</>;

  const dropRow = (target: EventTarget) => (target instanceof Element ? target.closest<HTMLElement>("[data-drop]") : null);
  const canDrop = (row: HTMLElement | null) => {
    const kind = row ? verdicts?.get(row.dataset.drop ?? "")?.kind : undefined;
    return kind === "ok" || kind === "warn";
  };

  function save(sessionId: string, next: string[], previous: string[], message: string) {
    startTransition(async () => {
      const result = await setSessionResources(sessionId, next);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(message, {
        action: {
          label: "Deshacer",
          onClick: () =>
            startTransition(async () => {
              const undo = await setSessionResources(sessionId, previous);
              if (undo.ok) toast.success("Cambio deshecho");
              else toast.error(undo.error);
            }),
        },
      });
    });
  }

  return (
    <div
      ref={ref}
      onDragStart={(event) => {
        const block = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-session]") : null;
        if (!block?.dataset.session) return;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", block.dataset.session);
        setDrag({
          sessionId: block.dataset.session,
          fromId: block.dataset.from || null,
        });
      }}
      onDragEnd={() => {
        for (const block of ref.current?.querySelectorAll<HTMLElement>("[data-dragged]") ?? []) delete block.dataset.dragged;
        setDrag(null);
      }}
      onDragOver={(event) => {
        const row = dropRow(event.target);
        if (!canDrop(row)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if (row && row.dataset.over !== "true") {
          for (const other of ref.current?.querySelectorAll<HTMLElement>("[data-over]") ?? []) delete other.dataset.over;
          row.dataset.over = "true";
        }
      }}
      onDragLeave={(event) => {
        const row = dropRow(event.target);
        if (row && !row.contains(event.relatedTarget as Node | null)) delete row.dataset.over;
      }}
      onDrop={(event) => {
        const row = dropRow(event.target);
        event.preventDefault();
        if (!drag || !row || !canDrop(row)) return setDrag(null);
        const session = sessionById.get(drag.sessionId);
        const toId = row.dataset.drop === "none" ? null : (row.dataset.drop ?? null);
        const from = drag.fromId ? byId.get(drag.fromId) : undefined;
        const to = toId ? byId.get(toId) : undefined;
        setDrag(null);
        if (!session || (toId && !to)) return;
        const next = resourceIdsAfterDrop(session.resourceIds, from ?? null, to ?? null);
        const what = `${session.start} ${session.productName}`;
        save(session.id, next, session.resourceIds, to ? `${to.name} → ${what}` : `${from?.name ?? "Recurso"} fuera de ${what}`);
      }}
      data-dragging={drag ? "true" : undefined}
      className="group/dnd"
    >
      {children}
    </div>
  );
}
