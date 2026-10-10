import { NextResponse } from "next/server";

import { getCurrentStaff } from "@/lib/auth";
import { businessToday } from "@/lib/domain/schedule";
import { attentionItems } from "@/lib/domain/today";

import { loadSoonSessions } from "../../today-data";

/** Cuántos avisos hay ahora (el punto rojo de la campana). Solo el equipo. */
export async function GET() {
  if (!(await getCurrentStaff())) return NextResponse.json({ error: "Sin permiso" }, { status: 401 });
  const now = new Date();
  const count = attentionItems(await loadSoonSessions(businessToday(now), now), now).length;
  return NextResponse.json({ count }, { headers: { "Cache-Control": "no-store" } });
}
