import type { Metadata } from "next";
import Link from "next/link";
import { CalendarX2, ChevronLeft, ChevronRight, Handshake, Globe, Phone, Plus, Sparkles, Store, type LucideIcon } from "lucide-react";

import { AttentionList } from "@/components/hoy/attention-list";
import { DayPicker } from "@/components/hoy/day-picker";
import { FeedItem } from "@/components/hoy/feed-item";
import { SessionRow } from "@/components/hoy/session-row";
import type { ActivityItem } from "@/components/hoy/types";
import { Button } from "@/components/ui/button";
import { requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/db/server";
import { canAccess } from "@/lib/domain/auth";
import { longDayLabel } from "@/lib/domain/calendar";
import { formatCents } from "@/lib/domain/money";
import { businessToday } from "@/lib/domain/schedule";
import { attentionItems, dayLabel, parseDayParam, shiftDay, timeAgo, type DayKpis } from "@/lib/domain/today";
import { cn } from "@/lib/utils";

import { loadToday } from "./today-data";

export const metadata: Metadata = { title: "Hoy" };

const dayHref = (day: string, today: string) => (day === today ? "/panel" : `/panel?fecha=${day}`);

/** El negocio aún no ha pasado por el asistente de configuración inicial. */
async function setupPending(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("setup_done_at").eq("id", 1).single();
  return data !== null && data.setup_done_at === null;
}

function SetupBanner() {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#b3d4f7] bg-primary-soft px-4 py-3.5">
      <span aria-hidden="true" className="grid size-10 flex-none place-items-center rounded-[10px] bg-primary text-white">
        <Sparkles className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <b className="block">Deja tu panel listo en dos minutos</b>
        <span className="text-[0.86rem] text-muted-foreground">El asistente te guía: negocio, entradas, equipo y tu primer tour con salidas.</span>
      </div>
      <Button asChild>
        <Link href="/panel/asistente">Abrir el asistente</Link>
      </Button>
    </div>
  );
}

export default async function Page({ searchParams }: PageProps<"/panel">) {
  const staff = await requireAccess("hoy");
  const now = new Date();
  const today = businessToday(now);
  const day = parseDayParam((await searchParams).fecha, today);
  const { sessions, kpis, soon, activity } = await loadToday(day, today, now);
  const attention = attentionItems(soon, now);
  const showSetup = canAccess(staff.role, "ajustes") && (await setupPending());

  return (
    <section className="flex flex-col gap-4 tablet:gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            <Button asChild variant="outline" size="icon-sm">
              <Link href={dayHref(shiftDay(day, -1), today)} aria-label="Día anterior">
                <ChevronLeft aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/panel">Hoy</Link>
            </Button>
            <Button asChild variant="outline" size="icon-sm">
              <Link href={dayHref(shiftDay(day, 1), today)} aria-label="Día siguiente">
                <ChevronRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
          <div>
            <p id="hoy-etiqueta" className="text-[0.72rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
              {dayLabel(day, today)}
            </p>
            <h1 aria-describedby="hoy-etiqueta" className="text-[1.15rem] first-letter:uppercase tablet:text-[1.45rem]">
              {longDayLabel(day)}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DayPicker day={day} />
          <Button asChild>
            <Link href={day > today ? `/panel/reservas/nueva?fecha=${day}` : "/panel/reservas/nueva"}>
              <Plus aria-hidden="true" />
              Nueva reserva
            </Link>
          </Button>
        </div>
      </div>

      {showSetup ? <SetupBanner /> : null}

      <Kpis kpis={kpis} />

      <div className="grid grid-cols-1 items-start gap-[18px] desk:grid-cols-[minmax(0,1fr)_340px]">
        <Box title="Salidas del día" aside={<span className="text-[0.8rem] text-muted-foreground">{sessions.length} programadas</span>}>
          {sessions.length ? (
            <ul>
              {sessions.map((session) => (
                <SessionRow key={session.id} session={session} />
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center gap-2 px-5 py-9 text-center text-muted-foreground">
              <CalendarX2 aria-hidden="true" className="size-8 text-faint" />
              <b className="text-foreground">No hay salidas este día</b>
              <span className="text-[0.86rem]">Las salidas se generan con las reglas de horario de cada producto.</span>
              <Button asChild variant="outline" size="sm">
                <Link href="/panel/productos">Ver productos</Link>
              </Button>
            </div>
          )}
        </Box>

        <div className="flex flex-col gap-3">
          <Box
            title="Requiere atención"
            aside={
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[0.72rem] font-semibold",
                  attention.some((item) => item.kind === "staff")
                    ? "bg-danger-soft text-danger"
                    : attention.length
                      ? "bg-warn-soft text-warn"
                      : "bg-ok-soft text-ok",
                )}
              >
                {attention.length}
              </span>
            }
          >
            <AttentionList items={attention} today={today} limit={5} />
          </Box>

          <Box title="Actividad reciente">
            <ul>
              {activity.length ? (
                activity.map((item) => <ActivityRow key={item.id} item={item} now={now} />)
              ) : (
                <li className="px-4 py-3 text-[0.82rem] text-muted-foreground">Aún no hay reservas.</li>
              )}
            </ul>
          </Box>
        </div>
      </div>
    </section>
  );
}

function Kpis({ kpis }: { kpis: DayKpis }) {
  const items = [
    { label: "Salidas", value: String(kpis.sessions), detail: `${kpis.sessionsWithBookings} con reservas` },
    { label: "Pasajeros", value: String(kpis.pax), detail: `${kpis.bookings} ${kpis.bookings === 1 ? "reserva" : "reservas"}` },
    {
      label: "Check-in",
      value: (
        <>
          {kpis.checkedIn}
          <span className="text-[1rem] text-faint"> / {kpis.pax}</span>
        </>
      ),
      detail: `${kpis.checkInPercent}% presentados`,
    },
    {
      label: "Ingresos del día",
      value: formatCents(kpis.revenueCents),
      detail: kpis.pendingPayments ? (
        <span className="font-semibold text-warn">
          {kpis.pendingPayments} {kpis.pendingPayments === 1 ? "pago pendiente" : "pagos pendientes"}
        </span>
      ) : (
        "Todo cobrado"
      ),
    },
  ];
  return (
    <dl className="grid grid-cols-2 overflow-hidden rounded-2xl border border-black/5 bg-surface shadow-card tablet:grid-cols-4">
      {items.map((item, index) => (
        <div
          key={item.label}
          className={cn(
            "min-w-0 px-3.5 py-3 tablet:px-[18px] tablet:py-3.5",
            index % 2 === 1 && "border-l border-line-2",
            index >= 2 && "border-t border-line-2 tablet:border-t-0",
            index === 2 && "tablet:border-l",
          )}
        >
          <dt className="text-[0.72rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">{item.label}</dt>
          <dd className="mt-[3px] text-[1.25rem] font-semibold tracking-[-0.03em] tabular-nums tablet:text-[1.6rem]">{item.value}</dd>
          <dd className="text-[0.76rem] text-muted-foreground">{item.detail}</dd>
        </div>
      ))}
    </dl>
  );
}

function Box({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  const headingId = `hoy-${title.normalize("NFD").replace(/[^a-zA-Z]+/g, "-").toLowerCase()}`;
  return (
    <section aria-labelledby={headingId} className="overflow-hidden rounded-2xl border border-black/5 bg-surface shadow-card">
      <div className="flex items-center justify-between gap-2.5 border-b border-line-2 px-4 py-[13px]">
        <h2 id={headingId} className="text-[0.98rem] font-semibold">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

const CHANNEL_ICONS: Record<string, LucideIcon> = { web: Globe, phone: Phone, desk: Store, agency: Handshake };

function ActivityRow({ item, now }: { item: ActivityItem; now: Date }) {
  return (
    <FeedItem
      icon={item.cancelled ? CalendarX2 : (CHANNEL_ICONS[item.channel] ?? Globe)}
      tone={item.cancelled ? "danger" : item.channel === "web" ? "accent" : "ok"}
    >
      <div className="flex justify-between gap-2">
        <Link href={`/panel/reservas/${item.code}`} className="truncate font-semibold underline-offset-2 hover:underline">
          {item.customerName}
        </Link>
        <span className="text-[0.76rem] whitespace-nowrap text-faint">{timeAgo(item.at, now)}</span>
      </div>
      <div className="truncate text-muted-foreground">{item.text}</div>
      <div className="truncate text-[0.76rem] text-muted-foreground">
        {item.productName} · {item.pax} pax · {formatCents(item.totalCents)}
      </div>
    </FeedItem>
  );
}
