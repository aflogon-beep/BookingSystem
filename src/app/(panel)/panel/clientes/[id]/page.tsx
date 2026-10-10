import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";

import { Box } from "@/components/ajustes/box";
import { AnonymizeCustomerButton } from "@/components/clientes/anonymize-customer-button";
import { BookingStatusPill } from "@/components/reservas/booking-pills";
import { Button } from "@/components/ui/button";
import { requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/db/server";
import { listDateLabel } from "@/lib/domain/booking-list";
import { toBusinessDateTime } from "@/lib/domain/calendar";
import { formatCents } from "@/lib/domain/money";
import { initials } from "@/lib/domain/resources";

export const metadata: Metadata = { title: "Cliente" };

export default async function Page({ params }: PageProps<"/panel/clientes/[id]">) {
  const staff = await requireAccess("clientes");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const supabase = await createClient();
  const [{ data: customer, error }, { data: bookings, error: bookingsError }, { data: privacy }] = await Promise.all([
    supabase.from("customer_list").select("id, name, email, phone, bookings, pax, spent_cents").eq("id", id).maybeSingle(),
    supabase
      .from("booking_list")
      .select("id, code, status, checked_in, starts_at, product_name, product_color, language")
      .eq("customer_id", id)
      .order("starts_at", { ascending: false })
      .limit(200),
    supabase.from("customers").select("anonymized_at").eq("id", id).maybeSingle(),
  ]);
  if (error || bookingsError) throw new Error("No se pudo cargar el cliente.");
  if (!customer) notFound();
  const name = customer.name ?? "";
  const anonymizedAt = privacy?.anonymized_at ?? null;

  return (
    <section className="flex max-w-[720px] flex-col gap-4 tablet:gap-5">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-1 px-1">
          <Link href="/panel/clientes">
            <ArrowLeft aria-hidden="true" />
            Clientes
          </Link>
        </Button>
      </div>

      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-12 flex-none place-items-center rounded-full bg-primary-soft text-[0.95rem] font-semibold text-primary-dark"
        >
          {initials(name)}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-[1.25rem] tablet:text-[1.45rem]">{name}</h1>
          <p className="truncate text-[0.86rem] text-muted-foreground">{customer.email}</p>
        </div>
      </div>

      <dl className="grid grid-cols-3 overflow-hidden rounded-2xl border border-black/5 bg-surface shadow-card">
        {[
          ["Reservas", String(customer.bookings ?? 0)],
          ["Pax", String(customer.pax ?? 0)],
          ["Gasto", formatCents(customer.spent_cents ?? 0)],
        ].map(([label, value], index) => (
          <div key={label} className={index ? "border-l border-line-2 px-3.5 py-3 tablet:px-[18px]" : "px-3.5 py-3 tablet:px-[18px]"}>
            <dt className="text-[0.72rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">{label}</dt>
            <dd className="mt-[3px] text-[1.15rem] font-semibold tracking-[-0.03em] tabular-nums tablet:text-[1.4rem]">{value}</dd>
          </div>
        ))}
      </dl>

      <Box title="Contacto">
        <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-2 p-4 text-[0.88rem]">
          <dt className="text-muted-foreground">Teléfono</dt>
          <dd className="font-mono">
            {customer.phone ? (
              <a href={`tel:${customer.phone}`} className="underline-offset-2 hover:underline">
                {customer.phone}
              </a>
            ) : (
              "—"
            )}
          </dd>
          <dt className="text-muted-foreground">Email</dt>
          <dd className="truncate">
            {customer.email ? (
              <a href={`mailto:${customer.email}`} className="underline-offset-2 hover:underline">
                {customer.email}
              </a>
            ) : (
              "—"
            )}
          </dd>
        </dl>
      </Box>

      <Box title="Reservas">
        <ul>
          {bookings.map((booking) => {
            const { date, time } = toBusinessDateTime(booking.starts_at ?? "");
            return (
              <li key={booking.id} className="border-t border-line-2 first:border-t-0">
                <Link href={`/panel/reservas/${booking.code}`} className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-surface-2">
                  <span aria-hidden="true" className="size-2.5 flex-none rounded-[3px]" style={{ background: booking.product_color ?? "#999999" }} />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[0.86rem]">{booking.product_name}</b>
                    <span className="text-[0.8rem] text-muted-foreground">
                      <span className="inline-block first-letter:uppercase">{listDateLabel(date)}</span> · {time} ·{" "}
                      <span className="font-mono">{booking.code}</span>
                    </span>
                  </span>
                  <BookingStatusPill status={booking.status ?? ""} checkedIn={booking.checked_in ?? false} />
                </Link>
              </li>
            );
          })}
        </ul>
      </Box>

      {anonymizedAt ? (
        <p className="text-[0.8rem] text-muted-foreground">
          Datos personales borrados el {toBusinessDateTime(anonymizedAt).date.split("-").reverse().join("/")}.
        </p>
      ) : staff.role === "admin" ? (
        <Box title="Datos personales" action={<AnonymizeCustomerButton customerId={customer.id ?? id} name={name} />}>
          <p className="p-4 text-[0.84rem] text-muted-foreground">
            Si el cliente pide que borremos sus datos (RGPD), bórralos aquí. Se borran solos{" "}
            <Link href="/panel/ajustes/politicas" className="underline underline-offset-2">
              pasado el plazo de conservación
            </Link>
            .
          </p>
        </Box>
      ) : null}
    </section>
  );
}
