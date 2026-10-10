import type { NextRequest } from "next/server";

import { requireAccess } from "@/lib/auth";
import { bookingsCsv, csvFileName, parseBookingListParams } from "@/lib/domain/booking-list";
import { businessToday } from "@/lib/domain/schedule";

import { loadAllBookings } from "../list-data";

/** CSV de las reservas con los mismos filtros que el listado (todas, no solo la página). */
export async function GET(request: NextRequest) {
  await requireAccess("reservas");
  const params = parseBookingListParams(Object.fromEntries(request.nextUrl.searchParams));
  const now = new Date();
  const rows = await loadAllBookings(params, now);
  const csv = bookingsCsv(
    rows.map((row) => ({
      code: row.code,
      date: row.date,
      time: row.time,
      productName: row.productName,
      language: row.language,
      customerName: row.customerName,
      email: row.email,
      phone: row.phone,
      tickets: row.tickets,
      pax: row.pax,
      totalCents: row.totalCents,
      paymentStatus: row.paymentStatus,
      channel: row.channel,
      status: row.status,
    })),
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFileName(params.tab, businessToday(now))}"`,
      "Cache-Control": "no-store",
    },
  });
}
