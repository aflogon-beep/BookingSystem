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
  /** Ya empezó: no admite reservas. */
  past: boolean;
};

export type NewBookingInitial = { productId: string; date: string; sessionId: string | null };
