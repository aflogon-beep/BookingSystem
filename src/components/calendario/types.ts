export type CalendarSession = {
  id: string;
  date: string;
  time: string;
  language: string;
  capacity: number;
  /** Plazas ocupadas: reservas confirmadas y pendientes con el bloqueo vigente. */
  booked: number;
  status: "open" | "closed" | "cancelled";
  past: boolean;
  product: { name: string; color: string; minPax: number };
};
