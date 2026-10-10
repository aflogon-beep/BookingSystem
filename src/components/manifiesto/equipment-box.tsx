"use client";

import { useId, useState, useTransition } from "react";
import { Sparkles, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { autoAssignSession, setSessionResources } from "@/app/(panel)/panel/salidas/actions";
import { Box } from "@/components/ajustes/box";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  buildSlots,
  optionLabel,
  resourceIdsAfterChange,
  slotWarning,
  type AssignableResource,
  type AssignmentContext,
} from "@/lib/domain/assignment";
import { RESOURCE_TYPES, type ProductNeeds } from "@/lib/domain/resources";

/** Caja «Equipo asignado» del manifiesto: un desplegable por guía, vehículo o material que pide el producto. */
export function EquipmentBox({
  sessionId,
  cancelled,
  language,
  capacity,
  needs,
  assignedIds,
  resources,
  busyIds,
}: {
  sessionId: string;
  cancelled: boolean;
  language: string;
  capacity: number;
  needs: ProductNeeds;
  assignedIds: string[];
  resources: AssignableResource[];
  busyIds: string[];
}) {
  const id = useId();
  const [pending, startTransition] = useTransition();
  // Mientras se guarda, el desplegable ya muestra lo elegido.
  const [optimisticIds, setOptimisticIds] = useState<string[] | null>(null);

  const byId = new Map(resources.map((resource) => [resource.id, resource]));
  const currentIds = optimisticIds ?? assignedIds;
  const assigned = currentIds.flatMap((resourceId) => byId.get(resourceId) ?? []);
  const slots = buildSlots(needs, assigned);
  const context: AssignmentContext = { language, capacity, busyIds: new Set(busyIds) };
  const needsSomething = RESOURCE_TYPES.some((type) => needs[type] > 0);

  function change(key: string, value: string) {
    const ids = resourceIdsAfterChange(slots, key, value || null);
    setOptimisticIds(ids);
    startTransition(async () => {
      const result = await setSessionResources(sessionId, ids);
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
      setOptimisticIds(null);
    });
  }

  function autoAssign() {
    startTransition(async () => {
      const result = await autoAssignSession(sessionId);
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }

  return (
    <Box
      title="Equipo asignado"
      action={
        needsSomething && !cancelled ? (
          <Button variant="outline" size="sm" onClick={autoAssign} disabled={pending}>
            <Sparkles aria-hidden="true" />
            Auto
          </Button>
        ) : null
      }
    >
      {slots.length ? (
        <div className="flex flex-col gap-3 p-4">
          {slots.map((slot) => {
            const chosen = slot.resourceId ? byId.get(slot.resourceId) : undefined;
            const warning = chosen && !cancelled ? slotWarning(chosen, context) : null;
            const takenElsewhere = new Set(slots.filter((other) => other.key !== slot.key).map((other) => other.resourceId));
            const selectId = `${id}-${slot.key}`;
            return (
              <div key={slot.key} className="flex flex-col gap-1.5">
                <Label htmlFor={selectId}>{slot.label}</Label>
                <NativeSelect
                  id={selectId}
                  value={slot.resourceId ?? ""}
                  disabled={pending || cancelled}
                  aria-describedby={warning ? `${selectId}-warning` : undefined}
                  onChange={(event) => change(slot.key, event.target.value)}
                >
                  <option value="">Sin asignar</option>
                  {resources
                    .filter((resource) => resource.type === slot.type)
                    .map((resource) => (
                      <option key={resource.id} value={resource.id} disabled={takenElsewhere.has(resource.id)}>
                        {optionLabel(resource, context)}
                      </option>
                    ))}
                </NativeSelect>
                {warning ? (
                  <p id={`${selectId}-warning`} className="flex items-center gap-1 text-[0.76rem] text-warn">
                    <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />
                    {warning}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="p-4 text-[0.86rem] text-muted-foreground">Este producto no necesita equipo.</p>
      )}
    </Box>
  );
}
