import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";

import { CustomerSearch } from "@/components/clientes/customer-search";
import { Pill } from "@/components/ui/pill";
import { requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/db/server";
import { ilikePattern, listDateLabel } from "@/lib/domain/booking-list";
import { toBusinessDateTime } from "@/lib/domain/calendar";
import { formatCents } from "@/lib/domain/money";
import { initials } from "@/lib/domain/resources";

export const metadata: Metadata = { title: "Clientes" };

/** Como el prototipo: los 150 que más gastan (o que coinciden con la búsqueda). */
const LIMIT = 150;

export default async function Page({ searchParams }: PageProps<"/panel/clientes">) {
  await requireAccess("clientes");
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 100) ?? "";

  const supabase = await createClient();
  const list = () => {
    const query = supabase.from("customer_list").select("id, name, email, phone, bookings, pax, spent_cents, last_starts_at", { count: "exact" });
    return q ? query.ilike("search_text", ilikePattern(q)) : query;
  };
  const repeat = () => {
    const query = supabase.from("customer_list").select("id", { count: "exact", head: true }).gt("bookings", 1);
    return q ? query.ilike("search_text", ilikePattern(q)) : query;
  };
  const [{ data: customers, error, count }, { count: repeating, error: repeatError }] = await Promise.all([
    list().order("spent_cents", { ascending: false }).order("name").range(0, LIMIT - 1),
    repeat(),
  ]);
  if (error || repeatError) throw new Error("No se pudieron cargar los clientes.");
  const total = count ?? customers.length;

  return (
    <section className="flex flex-col gap-4 tablet:gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[1.25rem] tablet:text-[1.45rem]">Clientes</h1>
          <p className="mt-[3px] text-[0.86rem] text-muted-foreground">
            {total === 1 ? "1 cliente" : `${total} clientes`} · {repeating ?? 0} repiten
          </p>
        </div>
        <CustomerSearch initial={q} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-black/5 bg-surface shadow-card">
        {customers.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[0.86rem]">
              <thead>
                <tr className="border-b border-line-2 text-left text-[0.72rem] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
                  <th scope="col" className="px-3 py-2.5 tablet:px-4">
                    Cliente
                  </th>
                  <th scope="col" className="px-2 py-2.5 max-desk:hidden">
                    Teléfono
                  </th>
                  <th scope="col" className="px-2 py-2.5 text-right">
                    Reservas
                  </th>
                  <th scope="col" className="px-2 py-2.5 text-right max-tablet:hidden">
                    Pasajeros
                  </th>
                  <th scope="col" className="px-2 py-2.5 text-right">
                    Gasto
                  </th>
                  <th scope="col" className="px-3 py-2.5 max-tablet:hidden tablet:px-4">
                    Última salida
                  </th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => {
                  const name = customer.name ?? "";
                  return (
                    <tr key={customer.id} aria-label={name} className="border-b border-line-2 last:border-b-0 hover:bg-surface-2">
                      <td className="px-3 py-2.5 tablet:px-4">
                        <div className="flex items-center gap-2.5">
                          <span
                            aria-hidden="true"
                            className="grid size-8 flex-none place-items-center rounded-full bg-primary-soft text-[0.72rem] font-semibold text-primary-dark max-tablet:hidden"
                          >
                            {initials(name)}
                          </span>
                          <div className="min-w-0">
                            <Link
                              href={`/panel/clientes/${customer.id}`}
                              className="block max-w-[240px] truncate font-semibold underline-offset-2 hover:underline"
                            >
                              {name}
                            </Link>
                            <span className="block max-w-[240px] truncate text-[0.78rem] text-muted-foreground">{customer.email}</span>
                          </div>
                          {(customer.bookings ?? 0) > 1 ? <Pill className="bg-primary-soft text-primary-dark">Repite</Pill> : null}
                        </div>
                      </td>
                      <td className="px-2 py-2.5 font-mono text-[0.8rem] max-desk:hidden">{customer.phone}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{customer.bookings}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums max-tablet:hidden">{customer.pax}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{formatCents(customer.spent_cents ?? 0)}</td>
                      <td className="px-3 py-2.5 first-letter:uppercase max-tablet:hidden tablet:px-4">
                        {customer.last_starts_at ? listDateLabel(toBusinessDateTime(customer.last_starts_at).date) : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 px-5 py-9 text-center text-muted-foreground">
            <SearchX aria-hidden="true" className="size-8 text-faint" />
            <b className="text-foreground">{q ? "Ningún cliente con esa búsqueda" : "Todavía no hay clientes"}</b>
          </div>
        )}
      </div>
    </section>
  );
}
