import { arrivalState, arrivedOf, isLive, paxOf, type ManifestBooking } from "@/lib/domain/manifest";

/** Momento de la salida para la hoja del guía: antes de salir, en ruta o terminada. */
export type GuideMoment =
  | { kind: "before"; minutesUntil: number }
  | { kind: "running"; progress: number; minutesLeft: number }
  | { kind: "ended" };

export function guideMoment(startsAt: string, endsAt: string, now: Date): GuideMoment {
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  const at = now.getTime();
  if (at < start) return { kind: "before", minutesUntil: Math.ceil((start - at) / 60_000) };
  if (at >= end) return { kind: "ended" };
  return {
    kind: "running",
    progress: Math.round(((at - start) / Math.max(1, end - start)) * 100),
    minutesLeft: Math.ceil((end - at) / 60_000),
  };
}

/** «Sale en 25 min», «Sale en 2 h 05 min», «Sale mañana», «Sale en 3 días». */
export function departureText(minutesUntil: number): string {
  if (minutesUntil <= 0) return "Sale ahora";
  if (minutesUntil < 60) return `Sale en ${minutesUntil} min`;
  if (minutesUntil < 24 * 60) {
    const hours = Math.floor(minutesUntil / 60);
    const rest = minutesUntil % 60;
    return rest ? `Sale en ${hours} h ${String(rest).padStart(2, "0")} min` : `Sale en ${hours} h`;
  }
  const days = Math.round(minutesUntil / (24 * 60));
  return days <= 1 ? "Sale mañana" : `Sale en ${days} días`;
}

export type BoardingSummary = {
  pax: number;
  checkedIn: number;
  noShows: number;
};

/** Ya no falta nadie por llegar y ha llegado alguien: «¡Todos a bordo!». */
export function allAboard({ pax, checkedIn, noShows }: BoardingSummary): boolean {
  return pax > 0 && checkedIn > 0 && pax - checkedIn - noShows <= 0;
}

/** Frase de la hoja del guía según cuántos faltan. */
export function boardingText(summary: BoardingSummary): string {
  const waiting = Math.max(0, summary.pax - summary.checkedIn - summary.noShows);
  if (!summary.pax) return "Aún no hay pasajeros";
  if (allAboard(summary)) return "¡Todos a bordo!";
  if (waiting === summary.pax) return waiting === 1 ? "Esperando a 1 pasajero" : `Esperando a ${waiting} pasajeros`;
  return waiting === 1 ? "Falta 1 por llegar" : `Faltan ${waiting} por llegar`;
}

export type PickupStop<T> = {
  /** Clave estable (para React y anclas). */
  key: string;
  name: string;
  /** Es el punto de encuentro del producto (reservas sin hotel). */
  meetingPoint: boolean;
  bookings: T[];
  pax: number;
  arrived: number;
  /** Grupos marcados como «No se ha presentado». */
  noShows: number;
};

const normalize = (text: string) => text.trim().toLocaleLowerCase("es").replace(/\s+/g, " ");

/**
 * Paradas de la ruta: las reservas confirmadas agrupadas por hotel (sin distinguir mayúsculas ni
 * espacios). Primero el punto de encuentro (las que no tienen hotel) y después los hoteles por nombre.
 */
export function pickupStops<T extends ManifestBooking>(bookings: readonly T[], meetingPointName: string): PickupStop<T>[] {
  const stops = new Map<string, PickupStop<T>>();
  for (const booking of bookings.filter(isLive)) {
    const hotel = booking.hotel.trim();
    const key = hotel ? `hotel:${normalize(hotel)}` : "meeting-point";
    const stop =
      stops.get(key) ??
      ({
        key,
        name: hotel || meetingPointName.trim() || "Punto de encuentro",
        meetingPoint: !hotel,
        bookings: [],
        pax: 0,
        arrived: 0,
        noShows: 0,
      } satisfies PickupStop<T>);
    const pax = paxOf(booking);
    stop.bookings.push(booking);
    stop.pax += pax;
    stop.arrived += arrivedOf({ ...booking, pax });
    if (arrivalState(booking) === "no_show") stop.noShows += 1;
    stops.set(key, stop);
  }
  for (const stop of stops.values()) stop.bookings.sort((a, b) => a.customerName.localeCompare(b.customerName, "es"));
  return [...stops.values()].sort((a, b) => Number(b.meetingPoint) - Number(a.meetingPoint) || a.name.localeCompare(b.name, "es"));
}

/** La parada ya está resuelta: han llegado todos o los que faltan no se han presentado. */
export function stopDone(stop: Pick<PickupStop<ManifestBooking>, "bookings">): boolean {
  return stop.bookings.length > 0 && stop.bookings.every((booking) => arrivalState(booking) !== "pending");
}

export const MANIFEST_VIEWS = [
  { value: "guia", label: "Hoja del guía" },
  { value: "recogidas", label: "Recogidas" },
  { value: "lista", label: "Lista" },
] as const;

export type ManifestView = (typeof MANIFEST_VIEWS)[number]["value"];

export function parseManifestView(value: string | string[] | undefined): ManifestView {
  return MANIFEST_VIEWS.some((view) => view.value === value) ? (value as ManifestView) : "guia";
}
