"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";

import { findRepeatCustomers, type RepeatCustomer } from "@/app/(panel)/panel/reservas/actions";
import { repeatCustomerQuery } from "@/lib/domain/booking-form";

type Fields = { name: string; email: string; phone: string };

/**
 * «¿Es un cliente que ya ha reservado?»: mientras se escriben sus datos, propone los clientes que
 * encajan. Al elegir uno se rellenan nombre, email y teléfono (y la reserva va a su ficha).
 */
export function RepeatCustomers({ customer, onPick }: { customer: Fields; onPick: (customer: RepeatCustomer) => void }) {
  const query = repeatCustomerQuery(customer);
  const [found, setFound] = useState<{ query: string; customers: RepeatCustomer[] } | null>(null);

  useEffect(() => {
    if (!query) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      findRepeatCustomers(query)
        .then((customers) => {
          if (!cancelled) setFound({ query, customers });
        })
        .catch(() => {
          if (!cancelled) setFound({ query, customers: [] });
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const same = (candidate: RepeatCustomer) =>
    candidate.name.trim().toLowerCase() === customer.name.trim().toLowerCase() &&
    candidate.email.trim().toLowerCase() === customer.email.trim().toLowerCase();
  const customers = query && found?.query === query ? found.customers : [];
  // Ya elegido (o escrito igual): no hace falta proponerlo.
  if (!customers.length || customers.some(same)) return null;

  return (
    <div className="col-span-full rounded-xl border border-primary/15 bg-primary-soft/50 p-2.5">
      <p className="flex items-center gap-1.5 px-1 pb-1.5 text-[0.78rem] font-semibold text-primary-dark">
        <History aria-hidden="true" className="size-3.5" />
        ¿Ya ha reservado antes?
      </p>
      <ul className="flex flex-col gap-1">
        {customers.map((candidate) => (
          <li key={candidate.id}>
            <button
              type="button"
              onClick={() => onPick(candidate)}
              aria-label={`Usar los datos de ${candidate.name}`}
              className="flex min-h-11 w-full items-center gap-2 rounded-lg bg-surface px-3 py-1.5 text-left hover:bg-surface-2 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none tablet:min-h-9"
            >
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[0.88rem] font-semibold">{candidate.name}</b>
                <span className="block truncate text-[0.76rem] text-muted-foreground">
                  {[candidate.email, candidate.phone].filter(Boolean).join(" · ") || "Sin contacto"}
                </span>
              </span>
              <span className="flex-none text-[0.76rem] text-muted-foreground tabular-nums">
                {candidate.bookings} {candidate.bookings === 1 ? "reserva" : "reservas"}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
