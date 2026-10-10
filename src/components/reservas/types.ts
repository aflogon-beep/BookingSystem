import type { ResourceType } from "@/lib/domain/resources";

/** Datos del formulario de nueva reserva que prepara el servidor. */

export type NewBookingTicket = { id: string; name: string; takesSeat: boolean; priceCents: number };

export type NewBookingProduct = {
  id: string;
  name: string;
  color: string;
  photoUrl: string | null;
  pickup: boolean;
  tickets: NewBookingTicket[];
};

export type DaySession = {
  id: string;
  time: string;
  language: string;
  status: "open" | "closed" | "cancelled";
  free: number;
  booked: number;
  /** Ya empezó: no admite reservas. */
  started: boolean;
  ended: boolean;
  /** Recurso obligatorio que no está libre a esa hora (no admite reservas), o null. */
  blockingNeed: ResourceType | null;
  /** Se vende en la web: producto a la venta y antes del cierre de venta online. */
  webOpen: boolean;
};

export type NewBookingInitial = { productId: string; date: string; sessionId: string | null };
