import Link from "next/link";
import { CircleCheck, UserMinus, UserX } from "lucide-react";

import type { TodaySession } from "@/components/hoy/types";
import { FeedItem } from "@/components/hoy/feed-item";
import { longDayLabel } from "@/lib/domain/calendar";
import { shiftDay, type AttentionItem } from "@/lib/domain/today";

/** Avisos de las próximas 48 h (Hoy · Requiere atención y la pantalla Avisos), enlazados al manifiesto. */
export function AttentionList({ items, today, limit }: { items: AttentionItem<TodaySession>[]; today: string; limit?: number }) {
  if (!items.length) {
    return (
      <ul>
        <FeedItem icon={CircleCheck} tone="ok">
          <b>Todo en orden</b>
          <div className="text-muted-foreground">Las salidas de las próximas 48 h tienen equipo asignado y llegan al mínimo.</div>
        </FeedItem>
      </ul>
    );
  }
  return (
    <ul>
      {items.slice(0, limit).map(({ session, kind, text }) => (
        <FeedItem key={`${session.id}-${kind}`} icon={kind === "staff" ? UserX : UserMinus} tone={kind === "staff" ? "danger" : "warn"}>
          <Link href={`/panel/salidas/${session.id}`} className="block truncate font-bold hover:underline">
            {session.product.name}
          </Link>
          <span className="text-muted-foreground">
            <AttentionWhen session={session} today={today} /> · {session.language.toUpperCase()} · {text}
          </span>
        </FeedItem>
      ))}
    </ul>
  );
}

function AttentionWhen({ session, today }: { session: TodaySession; today: string }) {
  const when = session.date === today ? "Hoy" : session.date === shiftDay(today, 1) ? "Mañana" : longDayLabel(session.date);
  return (
    <span className="first-letter:uppercase">
      {when} · {session.time}
    </span>
  );
}
