export type NavId =
  | "hoy"
  | "calendario"
  | "reservas"
  | "clientes"
  | "productos"
  | "equipo"
  | "informes"
  | "ajustes";

export type NavItem = {
  id: NavId;
  label: string;
  href: string;
  /** Rutas extra que también activan la sección (p. ej. el manifiesto activa Calendario). */
  alsoActiveOn?: readonly string[];
  /** Ajustes no va en la navegación principal de escritorio: tiene su icono en la barra superior. */
  inTopNav: boolean;
};

/** Secciones del panel, en el orden del prototipo. */
export const PANEL_NAV: readonly NavItem[] = [
  { id: "hoy", label: "Hoy", href: "/panel", inTopNav: true },
  { id: "calendario", label: "Calendario", href: "/panel/calendario", alsoActiveOn: ["/panel/manifiesto"], inTopNav: true },
  { id: "reservas", label: "Reservas", href: "/panel/reservas", inTopNav: true },
  { id: "clientes", label: "Clientes", href: "/panel/clientes", inTopNav: true },
  { id: "productos", label: "Productos", href: "/panel/productos", inTopNav: true },
  { id: "equipo", label: "Equipo", href: "/panel/equipo", inTopNav: true },
  { id: "informes", label: "Informes", href: "/panel/informes", inTopNav: true },
  { id: "ajustes", label: "Ajustes", href: "/panel/ajustes", inTopNav: false },
];

/** Secciones con pestaña propia en móvil. El resto va en «Más». */
export const TAB_BAR_IDS: readonly NavId[] = ["hoy", "calendario", "reservas"];

export const NEW_BOOKING_HREF = "/panel/reservas/nueva";

export function navItem(id: NavId): NavItem {
  const item = PANEL_NAV.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`Sección de panel desconocida: ${id}`);
  return item;
}

function normalize(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

function isWithin(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  const path = normalize(pathname);
  // La raíz del panel (Hoy) solo se activa en sí misma, no en todas las subrutas.
  if (item.href === "/panel") return path === "/panel";
  return [item.href, ...(item.alsoActiveOn ?? [])].some((base) => isWithin(path, base));
}

export function isMoreActive(pathname: string): boolean {
  return PANEL_NAV.some((item) => !TAB_BAR_IDS.includes(item.id) && isNavItemActive(item, pathname));
}
