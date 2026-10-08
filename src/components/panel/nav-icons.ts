import {
  CalendarCheck2,
  CalendarRange,
  ChartLine,
  IdCard,
  Mountain,
  Settings,
  Ticket,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { NavId } from "@/lib/panel-nav";

export const NAV_ICONS: Record<NavId, LucideIcon> = {
  hoy: CalendarCheck2,
  calendario: CalendarRange,
  reservas: Ticket,
  clientes: Users,
  productos: Mountain,
  equipo: IdCard,
  informes: ChartLine,
  ajustes: Settings,
};
