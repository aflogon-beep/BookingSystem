import type { Metadata } from "next";
import Link from "next/link";

import { Box } from "@/components/ajustes/box";
import { ChannelShare, DailyRevenueChart, LanguageBars, ProductBars } from "@/components/informes/charts";
import { requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/db/server";
import { formatCents } from "@/lib/domain/money";
import { REPORT_PERIODS, buildReport, parseReportPeriod, reportRange, reportSummarySchema, roundToEuros } from "@/lib/domain/reports";
import { businessToday } from "@/lib/domain/schedule";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Informes" };

const segmentClass = (current: boolean) =>
  cn(
    "inline-flex items-center rounded-md px-[11px] py-[5px] text-[0.8rem] font-medium max-tablet:py-2",
    current ? "bg-surface text-foreground shadow-[0_1px_2px_rgb(16_24_40/0.12)]" : "text-muted-foreground",
  );

export default async function Page({ searchParams }: PageProps<"/panel/informes">) {
  await requireAccess("informes");
  const period = parseReportPeriod((await searchParams).periodo);
  const today = businessToday(new Date());
  const range = reportRange(period, today);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_summary", { p_from: range.from, p_to: range.to });
  const summary = reportSummarySchema.safeParse(data);
  if (error || !summary.success) throw new Error("No se pudo cargar el informe.");
  const report = buildReport(summary.data, range.days, today);
  const { kpis } = report;
  const past = period === "pasados";

  return (
    <section className="flex flex-col gap-4 tablet:gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[1.25rem] tablet:text-[1.45rem]">Informes</h1>
          <p className="mt-[3px] text-[0.86rem] text-muted-foreground">
            {past ? "Salidas de los últimos 30 días" : "Reservas ya hechas para los próximos 30 días"}
          </p>
        </div>
        <nav aria-label="Periodo del informe" className="inline-flex flex-none gap-0.5 rounded-[9px] bg-[#e8e8ed] p-[3px]">
          {REPORT_PERIODS.map((option) => (
            <Link
              key={option.value}
              href={option.value === "pasados" ? "/panel/informes" : `/panel/informes?periodo=${option.value}`}
              aria-current={option.value === period ? "page" : undefined}
              className={segmentClass(option.value === period)}
            >
              {option.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* Como el prototipo: 2 columnas por debajo de 820 px, para que quepan importes largos. */}
      <dl className="grid grid-cols-2 overflow-hidden rounded-2xl border border-black/5 bg-surface shadow-card min-[820px]:grid-cols-4">
        {[
          ["Ingresos", formatCents(roundToEuros(kpis.revenueCents)), kpis.bookings === 1 ? "1 reserva" : `${kpis.bookings} reservas`],
          ["Pasajeros", String(kpis.pax), `${kpis.paxPerBooking} por reserva`],
          ["Ticket medio", formatCents(roundToEuros(kpis.avgTicketCents)), "por reserva"],
          ["Ocupación", `${kpis.occupancyPercent}%`, `${kpis.bookedSeats} de ${kpis.capacity} plazas`],
        ].map(([label, value, detail], index) => (
          <div
            key={label}
            className={cn(
              "min-w-0 px-3.5 py-3 tablet:px-[18px] tablet:py-3.5",
              index % 2 === 1 && "border-l border-line-2",
              index >= 2 && "border-t border-line-2 min-[820px]:border-t-0",
              index === 2 && "min-[820px]:border-l",
            )}
          >
            <dt className="text-[0.72rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">{label}</dt>
            <dd className="mt-[3px] text-[1.25rem] font-semibold tracking-[-0.03em] tabular-nums tablet:text-[1.6rem]">{value}</dd>
            <dd className="text-[0.76rem] text-muted-foreground">{detail}</dd>
          </div>
        ))}
      </dl>

      <Box
        title="Ingresos por día de salida"
        action={
          past ? null : (
            <span className="inline-flex items-center gap-1.5 text-[0.8rem] text-muted-foreground">
              <span aria-hidden="true" className="size-2.5 rounded-[3px] bg-[#B3D4F7]" />
              Reservado, aún por realizar
            </span>
          )
        }
      >
        <div className="p-4">
          <DailyRevenueChart report={report} />
        </div>
      </Box>

      <div className="grid gap-4 desk:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] tablet:gap-5">
        <Box title="Por producto" action={<span className="text-[0.8rem] text-muted-foreground">Ingresos · ocupación</span>}>
          <div className="p-4">
            <ProductBars report={report} />
          </div>
        </Box>
        <div className="flex flex-col gap-4 tablet:gap-5">
          <Box title="Por canal">
            <div className="p-4">
              <ChannelShare report={report} />
            </div>
          </Box>
          <Box title="Pasajeros por idioma">
            <div className="p-4">
              <LanguageBars report={report} />
            </div>
          </Box>
        </div>
      </div>
    </section>
  );
}
