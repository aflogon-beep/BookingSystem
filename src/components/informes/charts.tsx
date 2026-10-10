import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

import { formatCents } from "@/lib/domain/money";
import { roundToEuros, type Report } from "@/lib/domain/reports";
import { cn } from "@/lib/utils";

const euros = (cents: number) => formatCents(roundToEuros(cents));
const shortDay = (day: string) => format(parseISO(day), "d MMM", { locale: es }).replaceAll(".", "");

/** Ingresos por día de salida: columnas con eje de euros (las de días futuros, más claras). */
export function DailyRevenueChart({ report }: { report: Report }) {
  const top = report.chartTopCents;
  return (
    <figure
      aria-label="Ingresos por día de salida"
      className="m-0 grid grid-cols-[auto_minmax(0,1fr)] grid-rows-[150px_auto] gap-x-2.5 tablet:grid-rows-[200px_auto]"
    >
      {/* El eje lleva céntimos si hace falta: con importes pequeños el tope puede ser 1,50 €. */}
      <div aria-hidden="true" className="-my-1.5 flex flex-col justify-between text-right text-[0.7rem] text-faint tabular-nums">
        <span>{formatCents(top)}</span>
        <span>{formatCents(Math.round(top / 2))}</span>
        <span>0</span>
      </div>
      <div className="relative border-b border-line bg-[linear-gradient(var(--color-line-2)_1px,transparent_1px)] bg-size-[100%_50%]">
        <ol aria-label="Ingresos por día" className="absolute inset-0 flex items-end gap-px px-0.5 tablet:gap-[3px]">
          {report.days.map((day) => (
            <li
              key={day.day}
              className={cn("min-w-0.5 flex-1 rounded-t-[3px] hover:brightness-110", day.future ? "bg-[#B3D4F7]" : "bg-primary")}
              style={{ height: `${day.heightPercent.toFixed(1)}%` }}
            >
              <span className="sr-only">
                {shortDay(day.day)}: {formatCents(day.revenueCents)}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <span />
      <div aria-hidden="true" className="flex gap-px px-0.5 pt-1.5 text-[0.7rem] text-faint tablet:gap-[3px]">
        {report.days.map((day, index) => (
          <span key={day.day} className={cn("min-w-0 flex-1 overflow-visible whitespace-nowrap", index % 10 !== 0 && "max-tablet:invisible")}>
            {index % 5 === 0 ? shortDay(day.day) : ""}
          </span>
        ))}
      </div>
    </figure>
  );
}

/** Por producto: barra de ingresos con el color del producto, importe y ocupación. */
export function ProductBars({ report }: { report: Report }) {
  if (!report.products.length) return <p className="m-0 text-muted-foreground">Sin datos</p>;
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {report.products.map((product) => (
        <li key={product.id} className="grid grid-cols-[minmax(90px,170px)_minmax(0,1fr)_auto] items-center gap-2.5 text-[0.86rem]">
          <span className="flex min-w-0 items-center gap-2">
            <span aria-hidden="true" className="size-2.5 flex-none rounded-[3px]" style={{ background: product.color }} />
            <span className="truncate">{product.name}</span>
          </span>
          <span aria-hidden="true" className="h-[9px] overflow-hidden rounded-full bg-line-2">
            <span className="block h-full rounded-full" style={{ width: `${product.widthPercent}%`, background: product.color }} />
          </span>
          <span className="text-right whitespace-nowrap tabular-nums">
            {euros(product.revenueCents)} <span className="text-faint">· {product.occupancyPercent}%</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Por canal: barra apilada con el reparto de ingresos y su leyenda. */
export function ChannelShare({ report }: { report: Report }) {
  return (
    <>
      <div aria-hidden="true" className="flex h-3 overflow-hidden rounded-full bg-surface-2">
        {report.channels.map((channel) => (
          <span key={channel.channel} title={channel.label} style={{ width: `${channel.sharePercent}%`, background: channel.color }} />
        ))}
      </div>
      <ul className="m-0 mt-3 flex list-none flex-wrap gap-x-4 gap-y-1.5 p-0 text-[0.84rem] text-muted-foreground">
        {report.channels.map((channel) => (
          <li key={channel.channel} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2.5 rounded-[3px]" style={{ background: channel.color }} />
            {channel.label} <b className="text-foreground tabular-nums">{Math.round(channel.sharePercent)}%</b>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Pasajeros por idioma de la salida. */
export function LanguageBars({ report }: { report: Report }) {
  if (!report.languages.length) return <p className="m-0 text-muted-foreground">Sin datos</p>;
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {report.languages.map((language) => (
        <li key={language.language} className="grid grid-cols-[80px_minmax(0,1fr)_auto] items-center gap-2.5 text-[0.86rem]">
          <span>{language.label}</span>
          <span aria-hidden="true" className="h-[9px] overflow-hidden rounded-full bg-line-2">
            <span className="block h-full rounded-full bg-primary" style={{ width: `${language.widthPercent}%` }} />
          </span>
          <span className="tabular-nums">{language.pax}</span>
        </li>
      ))}
    </ul>
  );
}
