import { describe, expect, it } from "vitest";

import { formatCents } from "./money";
import { canCollect, manifestSummary, manifestText, sortManifest, ticketsLabel, type ManifestBooking } from "./manifest";

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
