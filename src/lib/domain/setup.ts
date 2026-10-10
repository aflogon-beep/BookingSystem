import { z } from "zod";

import { CURRENCIES, LANGUAGES, LANGUAGE_CODES, SETTINGS_LIMITS, isLanguageCode } from "@/lib/domain/settings";
import { PRODUCT_COLORS, PRODUCT_LIMITS, parsePriceInput } from "@/lib/domain/product";
import { RESOURCE_LIMITS, type ProductNeeds } from "@/lib/domain/resources";
import { parseTimes } from "@/lib/domain/schedule";

/** Pasos del asistente de configuración inicial, como en el prototipo (sin la empresa de ejemplo). */
export const SETUP_STEPS = [
  { title: "Bienvenido a tu panel de reservas", subtitle: "Te dejo el panel listo en dos minutos." },
  { title: "Tu negocio", subtitle: "Lo básico para empezar a vender." },
  { title: "¿Qué entradas vendes?", subtitle: "Luego cada tour les pone precio." },
  { title: "Tu equipo", subtitle: "Quién guía y en qué idiomas." },
  { title: "Tu primer tour", subtitle: "Con un horario ya tendrás salidas en el calendario." },
  { title: "Todo listo", subtitle: "" },
] as const;

export type SetupStep = 0 | 1 | 2 | 3 | 4 | 5;

/** Tipos de entrada que propone el asistente si el negocio aún no tiene ninguno (los del prototipo). */
export const DEFAULT_TICKET_TYPES = [
  { key: "adult", name: "Adulto", note: "13 años o más", takesSeat: true, price: "45", on: true },
  { key: "child", name: "Niño", note: "4 a 12 años", takesSeat: true, price: "25", on: true },
  { key: "infant", name: "Bebé", note: "0 a 3 años, en brazos", takesSeat: false, price: "0", on: true },
  { key: "resident", name: "Residente canario", note: "Con certificado de residencia", takesSeat: true, price: "36", on: false },
] as const;

const DEFAULT_KEYS: readonly string[] = DEFAULT_TICKET_TYPES.map((ticket) => ticket.key);

export type ExistingTicketType = { id: string; name: string; note: string; takesSeat: boolean };

/** Una entrada del paso «¿Qué entradas vendes?»: `ref` es el id si ya existe o la clave si es nueva. */
export type TicketOption = { ref: string; name: string; note: string; takesSeat: boolean; on: boolean; price: string };

/**
 * Entradas que ofrece el asistente: las que ya tiene el negocio (todas marcadas, sin precio) o,
 * si no tiene ninguna, las del prototipo.
 */
export function ticketOptions(existing: readonly ExistingTicketType[]): TicketOption[] {
  if (existing.length) {
    return existing.map((ticket) => ({ ref: ticket.id, name: ticket.name, note: ticket.note, takesSeat: ticket.takesSeat, on: true, price: "" }));
  }
  return DEFAULT_TICKET_TYPES.map(({ key, ...ticket }) => ({ ref: key, ...ticket }));
}

export type SetupDraft = {
  businessName: string;
  currency: string;
  languages: string[];
  tickets: TicketOption[];
  guides: { name: string; languages: string[] }[];
  vehicles: { name: string; seats: string }[];
  tour: {
    name: string;
    durationMin: string;
    capacity: string;
    minPax: string;
    meetingPoint: string;
    weekdays: number[];
    times: string;
    language: string;
  };
};

/** Borrador inicial: los ajustes actuales del negocio y un tour como el del prototipo. */
export function newSetupDraft(settings: { businessName: string; currency: string; languages: readonly string[] }, tickets: TicketOption[]): SetupDraft {
  const languages = LANGUAGE_CODES.filter((code) => settings.languages.includes(code));
  const first = languages[0] ?? "es";
  return {
    businessName: settings.businessName,
    currency: settings.currency,
    languages: languages.length ? languages : ["es"],
    tickets,
    guides: [{ name: "", languages: [first] }],
    vehicles: [],
    tour: { name: "", durationMin: "180", capacity: "12", minPax: "2", meetingPoint: "", weekdays: [1, 2, 3, 4, 5, 6], times: "10:00", language: first },
  };
}

export type SetupContext = {
  /** Idiomas que usan las reglas de horario que ya hay: no se pueden quitar. */
  usedLanguages: readonly string[];
  /** Ya hay guías dados de alta (el primer tour necesitará uno aunque aquí no se añada ninguno). */
  hasGuides: boolean;
  /** Posición para el primer tipo de entrada nuevo. */
  nextTicketSort: number;
};

/** Entero escrito en un campo; null si no lo es o se sale de [min, max]. */
function intIn(raw: string, min: number, max: number): number | null {
  if (!/^\d{1,6}$/.test(raw.trim())) return null;
  const value = Number(raw.trim());
  return value >= min && value <= max ? value : null;
}

const filled = <T extends { name: string }>(rows: readonly T[]) => rows.filter((row) => row.name.trim() !== "");

/** Comprueba un paso. Devuelve el primer error, o null si se puede continuar. */
export function checkSetupStep(step: SetupStep, draft: SetupDraft, context: SetupContext): string | null {
  if (step === 1) {
    const name = draft.businessName.trim();
    if (!name) return "Escribe el nombre de tu empresa.";
    if (name.length > SETTINGS_LIMITS.businessName) return `El nombre admite ${SETTINGS_LIMITS.businessName} caracteres como máximo.`;
    if (!(CURRENCIES as readonly string[]).includes(draft.currency)) return "Moneda no admitida.";
    if (!draft.languages.length) return "Elige al menos un idioma.";
    if (draft.languages.some((code) => !isLanguageCode(code))) return "Idioma no válido.";
    const used = context.usedLanguages.find((code) => !draft.languages.includes(code));
    if (used) {
      const label = isLanguageCode(used) ? LANGUAGES[used].toLowerCase() : used;
      return `Ya hay horarios en ${label}: no lo quites (puedes cambiarlos luego en Productos).`;
    }
  }
  if (step === 2) {
    if (!draft.tickets.some((ticket) => ticket.on)) return "Elige al menos un tipo de entrada.";
  }
  if (step === 3) {
    for (const guide of filled(draft.guides)) {
      if (guide.name.trim().length > RESOURCE_LIMITS.name) return "El nombre de un guía es demasiado largo.";
      if (!guide.languages.some((code) => draft.languages.includes(code))) return "Cada guía necesita al menos un idioma.";
    }
    for (const vehicle of filled(draft.vehicles)) {
      if (vehicle.name.trim().length > RESOURCE_LIMITS.name) return "El nombre de un vehículo es demasiado largo.";
      if (intIn(vehicle.seats, RESOURCE_LIMITS.seats.min, RESOURCE_LIMITS.seats.max) === null) {
        return `Las plazas de cada vehículo van de ${RESOURCE_LIMITS.seats.min} a ${RESOURCE_LIMITS.seats.max}.`;
      }
    }
  }
  if (step === 4) {
    const tour = draft.tour;
    const name = tour.name.trim();
    if (!name) return "Ponle nombre al tour.";
    if (name.length > PRODUCT_LIMITS.name) return `El nombre admite ${PRODUCT_LIMITS.name} caracteres como máximo.`;
    const { duration, capacity: capacityLimits } = PRODUCT_LIMITS;
    if (intIn(tour.durationMin, duration.min, duration.max) === null) return `La duración va de ${duration.min} a ${duration.max} minutos.`;
    const capacity = intIn(tour.capacity, capacityLimits.min, capacityLimits.max);
    if (capacity === null) return `El aforo va de ${capacityLimits.min} a ${capacityLimits.max} plazas.`;
    const minPax = intIn(tour.minPax, 1, capacityLimits.max);
    if (minPax === null) return "El mínimo tiene que ser 1 o más.";
    if (minPax > capacity) return "El mínimo no puede ser mayor que el aforo.";
    for (const ticket of draft.tickets.filter((option) => option.on)) {
      if (parsePriceInput(ticket.price) === null) return `Escribe el precio de ${ticket.name} (por ejemplo, 45 o 45,50).`;
    }
    if (tour.meetingPoint.trim().length > PRODUCT_LIMITS.meetingPoint) return "El punto de encuentro es demasiado largo.";
    if (!tour.weekdays.length || tour.weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) return "Elige al menos un día.";
    if (!parseTimes(tour.times).length) return "Escribe al menos una hora de salida, por ejemplo 10:00.";
    if (!draft.languages.includes(tour.language)) return "Elige el idioma del tour.";
  }
  return null;
}

/** Lo que recibe complete_setup (sin el slug del producto, que pone la acción). */
export type SetupPayload = {
  settings: { business_name: string; currency: string; languages: string[] };
  ticket_types: { key: string; name: string; note: string; takes_seat: boolean; sort: number }[];
  resources: { name: string; type: "guide" | "vehicle"; seats: number; languages: string[] }[];
  product: {
    name: string;
    description: string;
    meeting_point: string;
    place: string;
    duration_min: number;
    capacity: number;
    min_pax: number;
    pickup: boolean;
    color: string;
    photo_path: null;
    active: boolean;
    needs: ProductNeeds;
  };
  prices: { ticket: string; price_cents: number }[];
  rules: { weekdays: number[]; times: string[]; language: string; valid_from: null; valid_to: null }[];
};

export type SetupResult = { ok: true; value: SetupPayload } | { ok: false; error: string; step: SetupStep };

/**
 * Valida todo el asistente (en servidor, sin fiarse del cliente) y lo convierte en lo que guarda
 * complete_setup. `existingTicketIds`: ids de los tipos de entrada que ya tiene el negocio.
 */
export function parseSetup(draft: SetupDraft, context: SetupContext & { existingTicketIds: readonly string[] }): SetupResult {
  for (const step of [1, 2, 3, 4] as const) {
    const error = checkSetupStep(step, draft, context);
    if (error) return { ok: false, error, step };
  }
  // Con tipos de entrada ya creados solo valen sus ids; sin ninguno, solo los del prototipo.
  const validRefs = context.existingTicketIds.length ? context.existingTicketIds : DEFAULT_KEYS;
  const chosen = draft.tickets.filter((ticket) => ticket.on);
  const refs = chosen.map((ticket) => ticket.ref);
  if (refs.some((ref) => !validRefs.includes(ref)) || new Set(refs).size !== refs.length) {
    return { ok: false, error: "Los tipos de entrada han cambiado. Recarga la página.", step: 2 };
  }

  const languages = LANGUAGE_CODES.filter((code) => draft.languages.includes(code));
  const guides = filled(draft.guides).map((guide) => ({
    name: guide.name.trim(),
    type: "guide" as const,
    seats: 1,
    languages: languages.filter((code) => guide.languages.includes(code)),
  }));
  const vehicles = filled(draft.vehicles).map((vehicle) => ({
    name: vehicle.name.trim(),
    type: "vehicle" as const,
    seats: Number(vehicle.seats.trim()),
    languages: [],
  }));
  const newTickets = context.existingTicketIds.length
    ? []
    : DEFAULT_TICKET_TYPES.filter((ticket) => refs.includes(ticket.key)).map((ticket, index) => ({
        key: ticket.key,
        name: ticket.name,
        note: ticket.note,
        takes_seat: ticket.takesSeat,
        sort: context.nextTicketSort + index,
      }));
  const tour = draft.tour;

  return {
    ok: true,
    value: {
      settings: { business_name: draft.businessName.trim(), currency: draft.currency, languages },
      ticket_types: newTickets,
      resources: [...guides, ...vehicles],
      product: {
        name: tour.name.trim(),
        description: "",
        meeting_point: tour.meetingPoint.trim(),
        place: "",
        duration_min: Number(tour.durationMin.trim()),
        capacity: Number(tour.capacity.trim()),
        min_pax: Number(tour.minPax.trim()),
        pickup: false,
        color: PRODUCT_COLORS[0],
        photo_path: null,
        active: true,
        // Como el prototipo: un guía si hay guías, y un vehículo si se ha añadido alguno.
        needs: { guide: guides.length || context.hasGuides ? 1 : 0, vehicle: vehicles.length ? 1 : 0, equipment: 0 },
      },
      prices: chosen.map((ticket) => ({ ticket: ticket.ref, price_cents: parsePriceInput(ticket.price) ?? 0 })),
      rules: [
        {
          weekdays: [...new Set(tour.weekdays)].filter((day) => day >= 1 && day <= 7).sort((a, b) => a - b),
          times: parseTimes(tour.times),
          language: tour.language,
          valid_from: null,
          valid_to: null,
        },
      ],
    },
  };
}

const text = (max: number) => z.string().max(max);

/** Forma del borrador que envía el navegador (los límites solo frenan entradas absurdas). */
export const setupDraftSchema = z.object({
  businessName: text(500),
  currency: text(10),
  languages: z.array(text(5)).max(10),
  tickets: z
    .array(z.object({ ref: text(64), name: text(200), note: text(200), takesSeat: z.boolean(), on: z.boolean(), price: text(20) }))
    .max(50),
  guides: z.array(z.object({ name: text(500), languages: z.array(text(5)).max(10) })).max(50),
  vehicles: z.array(z.object({ name: text(500), seats: text(10) })).max(50),
  tour: z.object({
    name: text(500),
    durationMin: text(10),
    capacity: text(10),
    minPax: text(10),
    meetingPoint: text(500),
    weekdays: z.array(z.number().int().min(1).max(7)).max(7),
    times: text(200),
    language: text(5),
  }),
});

/** parseSetup sobre lo que llega del navegador, sin suponer nada de su forma. */
export function parseSetupInput(input: unknown, context: SetupContext & { existingTicketIds: readonly string[] }): SetupResult {
  const draft = setupDraftSchema.safeParse(input);
  if (!draft.success) return { ok: false, error: "Datos no válidos. Recarga la página.", step: 1 };
  return parseSetup(draft.data, context);
}
