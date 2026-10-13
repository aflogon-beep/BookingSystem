import type { Metadata } from "next";
import Link from "next/link";

import { Box } from "@/components/ajustes/box";
import { ChannelShare, DailyRevenueChart, LanguageBars, ProductBars } from "@/components/informes/charts";
import { HeatmapGrid, KpiStrip, Podium } from "@/components/informes/highlights";
import { requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/db/server";
import {
  REPORT_PERIODS,
  buildHeatmap,
  buildReport,
  kpiDeltas,
  parseReportPeriod,
  previousRange,
  productPodium,
  reportHeatmapSchema,
  reportRange,
  reportSummarySchema,
} from "@/lib/domain/reports";
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

  const past = period === "pasados";
  // Los últimos 30 días se comparan con los 30 anteriores; lo reservado a futuro, con nada.
  const previous = past ? previousRange(range) : null;

  const supabase = await createClient();
  const [current, before, heat] = await Promise.all([
    supabase.rpc("report_summary", { p_from: range.from, p_to: range.to }),
    previous ? supabase.rpc("report_summary", { p_from: previous.from, p_to: previous.to }) : null,
    supabase.rpc("report_heatmap", { p_from: range.from, p_to: range.to }),
  ]);
  const summary = reportSummarySchema.safeParse(current.data);
  const previousSummary = before ? reportSummarySchema.safeParse(before.data) : null;
  const heatRows = reportHeatmapSchema.safeParse(heat.data);
  if (current.error || !summary.success || before?.error || previousSummary?.success === false || heat.error || !heatRows.success) {
    throw new Error("No se pudo cargar el informe.");
  }
  const report = buildReport(summary.data, range.days, today);
  const previousReport = previous && previousSummary?.success ? buildReport(previousSummary.data, [], today) : null;
  const deltas = previousReport ? kpiDeltas(report.kpis, previousReport.kpis) : null;
  const { podium, rising } = productPodium(report.products, previousReport?.products ?? null);
  const heatmap = buildHeatmap(heatRows.data);

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

      <KpiStrip kpis={report.kpis} deltas={deltas} />

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

      <div className="grid gap-4 desk:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] tablet:gap-5">
        <Box title="Lo más vendido" action={past ? <span className="text-[0.8rem] text-muted-foreground">frente a los 30 días anteriores</span> : null}>
          <div className="p-4">
            <Podium podium={podium} rising={rising} />
          </div>
        </Box>
        <Box title="Cuándo se llenan las salidas" action={<span className="text-[0.8rem] text-muted-foreground">Ocupación por día y hora</span>}>
          <div className="p-4">
            <HeatmapGrid heatmap={heatmap} />
          </div>
        </Box>
      </div>

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
