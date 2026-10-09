import type { Metadata } from "next";

import { loadEditorContext } from "@/app/(panel)/panel/productos/editor-data";
import { ProductEditor } from "@/components/productos/product-editor";
import { requireAccess } from "@/lib/auth";
import { PRODUCT_COLORS } from "@/lib/domain/product";
import { DEFAULT_NEEDS } from "@/lib/domain/resources";

export const metadata: Metadata = { title: "Nuevo producto" };

export default async function Page() {
  await requireAccess("productos");
  const { available, languages, currency, defaultCapacity, productCount, ticketTypes, today } = await loadEditorContext();
  const firstTicketType = ticketTypes[0];

  // Valores iniciales del prototipo: aforo por defecto de Ajustes, primer tipo de entrada activo,
  // una regla de lunes a viernes a las 10:00 en el primer idioma y un guía por salida.
  const product = {
    id: null,
    name: "",
    description: "",
    meetingPoint: "",
    nameEn: "",
    descriptionEn: "",
    meetingPointEn: "",
    place: "",
    durationMin: 120,
    capacity: defaultCapacity,
    minPax: 1,
    pickup: false,
    color: PRODUCT_COLORS[productCount % PRODUCT_COLORS.length] ?? PRODUCT_COLORS[0],
    photoPath: null,
    active: true,
    prices: firstTicketType ? [{ ticketTypeId: firstTicketType.id, priceCents: 0 }] : [],
    rules: [{ weekdays: [1, 2, 3, 4, 5], times: ["10:00"], language: languages[0] ?? "es", validFrom: null, validTo: null }],
    needs: DEFAULT_NEEDS,
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
