import { RESOURCE_TYPES, type ProductNeeds, type ResourceType } from "@/lib/domain/resources";
import { isLanguageCode, LANGUAGES } from "@/lib/domain/settings";

/** Recurso tal y como lo necesita el manifiesto para elegir equipo. */
export type AssignableResource = {
  id: string;
  name: string;
  type: ResourceType;
  seats: number;
  languages: string[];
};

/** Datos de la salida que importan para avisar de un recurso que no encaja. */
export type AssignmentContext = {
  language: string;
  capacity: number;
  /** Recursos ocupados en otra salida que se solapa con esta. */
  busyIds: ReadonlySet<string>;
};

/** Un hueco del manifiesto: «Guía 1», «Vehículo 1»… con el recurso elegido o vacío. */
export type Slot = { key: string; type: ResourceType; label: string; resourceId: string | null };

const SLOT_NAMES: Record<ResourceType, string> = { guide: "Guía", vehicle: "Vehículo", equipment: "Equipo" };

/**
 * Huecos de equipo de una salida: uno por unidad que pide el producto, rellenos en orden con lo ya
 * asignado. Si hay más asignado que lo que pide el producto (porque el producto cambió después),
 * se añaden huecos para que se vea y se pueda quitar.
 */
export function buildSlots(needs: ProductNeeds, assigned: readonly AssignableResource[]): Slot[] {
  const slots: Slot[] = [];
  for (const type of RESOURCE_TYPES) {
    const ofType = assigned.filter((resource) => resource.type === type);
    const count = Math.max(needs[type], ofType.length);
    for (let index = 0; index < count; index += 1) {
      slots.push({
        key: `${type}-${index}`,
        type,
        label: `${SLOT_NAMES[type]} ${index + 1}`,
        resourceId: ofType[index]?.id ?? null,
      });
    }
  }
  return slots;
}

/** Recursos que faltan: lo que pide el producto menos lo asignado, tipo a tipo. */
export function missingResources(needs: ProductNeeds, assigned: readonly { type: ResourceType }[]): number {
  return RESOURCE_TYPES.reduce(
    (total, type) => total + Math.max(needs[type] - assigned.filter((resource) => resource.type === type).length, 0),
    0,
  );
}

function languageName(code: string): string {
  return isLanguageCode(code) ? LANGUAGES[code] : code.toUpperCase();
}

const guidesIn = (resource: AssignableResource, language: string) =>
  resource.type !== "guide" || resource.languages.includes(language);

/** Texto de cada opción del desplegable: «Minibús 01 · 16 plazas · ocupado», «Lukas Weber · sin ES». */
export function optionLabel(resource: AssignableResource, context: AssignmentContext): string {
  const parts = [resource.name];
  if (resource.type === "vehicle") parts.push(`${resource.seats} plazas`);
  if (context.busyIds.has(resource.id)) parts.push("ocupado");
  if (!guidesIn(resource, context.language)) parts.push(`sin ${context.language.toUpperCase()}`);
  return parts.join(" · ");
}

/** Aviso bajo un hueco cuando el recurso elegido no encaja con la salida, o null si encaja. */
export function slotWarning(resource: AssignableResource, context: AssignmentContext): string | null {
  if (context.busyIds.has(resource.id)) return "Ya está en otra salida a esa hora";
  if (!guidesIn(resource, context.language)) return `No figura como guía en ${languageName(context.language).toLowerCase()}`;
  if (resource.type === "vehicle" && resource.seats < context.capacity) {
    return `${resource.seats} asientos para ${context.capacity} plazas`;
  }
  return null;
}

/**
 * Cambia el recurso de un hueco y devuelve la lista completa de recursos de la salida, sin huecos
 * vacíos ni repetidos (lo que guarda session_set_resources).
 */
export function resourceIdsAfterChange(slots: readonly Slot[], key: string, resourceId: string | null): string[] {
  const ids = slots.map((slot) => (slot.key === key ? resourceId : slot.resourceId)).filter((id): id is string => !!id);
  return [...new Set(ids)];
}

/** Aviso tras el botón «Auto». */
export function autoAssignMessage(missing: number): { ok: boolean; text: string } {
  if (missing <= 0) return { ok: true, text: "Equipo asignado" };
  return {
    ok: false,
    text: `${missing === 1 ? "Falta 1 recurso libre" : `Faltan ${missing} recursos libres`} o con ese idioma`,
  };
}
