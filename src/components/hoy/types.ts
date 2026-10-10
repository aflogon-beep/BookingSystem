import type { ResourceType } from "@/lib/domain/resources";
import type { MissingByType } from "@/lib/domain/today";

export type TodaySession = {
  id: string;
  startsAt: string;
  time: string;
  endTime: string;
  date: string;
  language: string;
  status: "open" | "closed" | "cancelled";
  capacity: number;
  booked: number;
  minPax: number;
  /** Equipo que le falta (vista session_staffing). */
  missing: MissingByType;
  /** Recurso obligatorio que no está libre a esa hora: no admite reservas (vista session_team_status). */
  blockingNeed: ResourceType | null;
  /** Se vende en la web: producto a la venta y antes del cierre de venta online. */
  webOpen: boolean;
  started: boolean;
  past: boolean;
  product: { name: string; color: string };
};

export type ActivityItem = {
  id: string;
  code: string;
  at: string;
  text: string;
  customerName: string;
  productName: string;
  pax: number;
  totalCents: number;
  channel: string;
  cancelled: boolean;
};
