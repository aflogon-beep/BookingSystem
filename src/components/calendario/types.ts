export type CalendarSession = {
  id: string;
  date: string;
  time: string;
  language: string;
  capacity: number;
  /** Plazas vendidas. Hasta que existan las reservas (tarea 1.6) siempre es 0. */
  booked: number;
  status: "open" | "closed" | "cancelled";
  past: boolean;
  product: { name: string; color: string; minPax: number };
};
