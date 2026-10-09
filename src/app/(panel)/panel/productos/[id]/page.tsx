import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { loadEditorContext } from "@/app/(panel)/panel/productos/editor-data";
import { ProductEditor } from "@/components/productos/product-editor";
import { requireAccess } from "@/lib/auth";
import { needsFromRows } from "@/lib/domain/resources";

export const metadata: Metadata = { title: "Editar producto" };

export default async function Page({ params }: PageProps<"/panel/productos/[id]">) {
  await requireAccess("productos");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const { supabase, available, languages, currency, ticketTypes, today } = await loadEditorContext();
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, name, description, meeting_point, name_en, description_en, meeting_point_en, place, duration_min, capacity, min_pax, pickup, color, photo_path, active, product_prices(ticket_type_id, price_cents), schedule_rules(weekdays, times, language, valid_from, valid_to, created_at), product_needs(resource_type, qty)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("No se pudo cargar el producto.");
  if (!data) notFound();

  const product = {
    id: data.id,
    name: data.name,
    description: data.description,
    meetingPoint: data.meeting_point,
    nameEn: data.name_en,
    descriptionEn: data.description_en,
    meetingPointEn: data.meeting_point_en,
    place: data.place,
    durationMin: data.duration_min,
    capacity: data.capacity,
    minPax: data.min_pax,
    pickup: data.pickup,
    color: data.color,
    photoPath: data.photo_path,
    active: data.active,
    prices: data.product_prices.map((price) => ({ ticketTypeId: price.ticket_type_id, priceCents: price.price_cents })),
    rules: data.schedule_rules
      .toSorted((a, b) => a.created_at.localeCompare(b.created_at))
      .map((rule) => ({
        weekdays: rule.weekdays,
        times: rule.times.map((time) => time.slice(0, 5)),
        language: rule.language,
        validFrom: rule.valid_from,
        validTo: rule.valid_to,
      })),
    needs: needsFromRows(data.product_needs),
  };

  return (
    <ProductEditor
      product={product}
      ticketTypes={ticketTypes}
      languages={languages}
      currency={currency}
      available={available}
      today={today}
    />
  );
}
