import { NextResponse } from "next/server";

import { getCurrentStaff } from "@/lib/auth";

import { countAlerts } from "../../today-data";

/** Cuántos avisos hay ahora (el punto rojo de la campana). Solo el equipo. */
export async function GET() {
  if (!(await getCurrentStaff())) return NextResponse.json({ error: "Sin permiso" }, { status: 401 });
  return NextResponse.json({ count: await countAlerts() }, { headers: { "Cache-Control": "no-store" } });
}
