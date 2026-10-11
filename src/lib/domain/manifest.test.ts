import { describe, expect, it } from "vitest";

import { formatCents } from "./money";
import {
  arrivalLabel,
  arrivalState,
  arrivedOf,
  canCollect,
  manifestSummary,
  manifestText,
  sortManifest,
  ticketsLabel,
  type ManifestBooking,
} from "./manifest";

const booking = (overrides: Partial<ManifestBooking> = {}): ManifestBooking => ({
  id: "b1",
  code: "VTAAAAAA",
  status: "confirmed",
  paymentStatus: "paid",
  totalCents: 13800,
  checkedIn: false,
  customerName: "Ana",
  phone: "",
  email: "",
  hotel: "",
  lines: [{ ticketName: "Adulto", qty: 2 }],
  ...overrides,
});

describe("manifiesto", () => {
  it("resume pasajeros, presentados, cobros y entradas de las confirmadas", () => {
    const summary = manifestSummary([
      booking({ checkedIn: true }),
      booking({ paymentStatus: "pending", totalCents: 4500, lines: [{ ticketName: "Adulto", qty: 1 }, { ticketName: "Niño", qty: 1 }] }),
      booking({ paymentStatus: "invoice" }),
      booking({ status: "cancelled", paymentStatus: "pending" }),
      booking({ status: "pending", paymentStatus: "pending" }),
    ]);
    expect(summary).toEqual({
      pax: 6,
      checkedIn: 2,
      noShows: 0,
      dueCents: 4500,
      invoiceCount: 1,
      tickets: [
        { ticketName: "Adulto", qty: 5 },
        { ticketName: "Niño", qty: 1 },
      ],
    });
  });

  it("solo se cobra lo confirmado y pendiente", () => {
    expect(canCollect({ status: "confirmed", paymentStatus: "pending" })).toBe(true);
    expect(canCollect({ status: "confirmed", paymentStatus: "invoice" })).toBe(false);
    expect(canCollect({ status: "cancelled", paymentStatus: "pending" })).toBe(false);
  });

  it("ordena confirmadas por nombre y deja las canceladas al final", () => {
    const sorted = sortManifest([
      booking({ customerName: "Zoe", status: "cancelled" }),
      booking({ customerName: "Óscar" }),
      booking({ customerName: "Ana" }),
    ]);
    expect(sorted.map((item) => item.customerName)).toEqual(["Ana", "Óscar", "Zoe"]);
  });

  it("etiqueta las entradas en minúsculas", () => {
    expect(ticketsLabel([{ ticketName: "Adulto", qty: 2 }, { ticketName: "Bebé", qty: 1 }])).toBe("2 adulto · 1 bebé");
  });

  it("genera el texto para copiar", () => {
    const text = manifestText({ productName: "Teide", dateLabel: "miércoles 14 de octubre", time: "16:30", language: "es" }, [
      booking({ customerName: "Ana", checkedIn: true, phone: "600111222", hotel: "Hotel Mencey" }),
      booking({ customerName: "Luis", paymentStatus: "pending" }),
      booking({ customerName: "Eva", status: "cancelled" }),
    ]);
    expect(text).toBe(
      [
        "Teide",
        "miércoles 14 de octubre · 16:30 · ES",
        "",
        "[x] Ana · 2 pax (2 adulto) · 600111222 · Hotel Mencey",
        `[ ] Luis · 2 pax (2 adulto) · COBRAR ${formatCents(13800)}`,
      ].join("\n"),
    );
  });
});

describe("llegadas por persona", () => {
  it("cuenta solo las personas que han llegado", () => {
    expect(arrivedOf({ checkedIn: true, pax: 4 })).toBe(4);
    expect(arrivedOf({ checkedIn: true, arrivedPax: 2, pax: 4 })).toBe(2);
    expect(arrivedOf({ checkedIn: false, noShow: true, pax: 4 })).toBe(0);
  });

  it("estado y texto de cada reserva", () => {
    expect(arrivalState({ checkedIn: false })).toBe("pending");
    expect(arrivalState({ checkedIn: true })).toBe("arrived");
    expect(arrivalState({ checkedIn: true, arrivedPax: 1 })).toBe("partial");
    expect(arrivalState({ checkedIn: false, noShow: true })).toBe("no_show");
    expect(arrivalLabel({ checkedIn: true, arrivedPax: 2, pax: 4 })).toBe("Llegan 2 de 4");
    expect(arrivalLabel({ checkedIn: false, noShow: true, pax: 4 })).toBe("No se ha presentado");
  });

  it("el resumen y el texto copiado reflejan llegadas parciales y ausencias", () => {
    const rows = [
      booking({ id: "a", checkedIn: true, arrivedPax: 1, customerName: "Ana" }),
      booking({ id: "b", noShow: true, customerName: "Bea" }),
    ];
    expect(manifestSummary(rows)).toMatchObject({ pax: 4, checkedIn: 1, noShows: 2 });
    const text = manifestText({ productName: "Teide", dateLabel: "lunes", time: "10:00", language: "es" }, rows);
    expect(text).toContain("[1/2] Ana");
    expect(text).toContain("[no vino] Bea");
  });
});
