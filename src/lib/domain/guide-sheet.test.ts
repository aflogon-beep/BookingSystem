import { describe, expect, it } from "vitest";

import { allAboard, boardingText, departureText, guideMoment, parseManifestView, pickupStops, stopDone } from "./guide-sheet";
import type { ManifestBooking } from "./manifest";

const booking = (overrides: Partial<ManifestBooking> = {}): ManifestBooking => ({
  id: "b1",
  code: "VTAAAAAA",
  status: "confirmed",
  paymentStatus: "paid",
  totalCents: 5000,
  checkedIn: false,
  customerName: "Ana",
  phone: "",
  email: "",
  hotel: "",
  lines: [{ ticketName: "Adulto", qty: 2 }],
  ...overrides,
});

describe("guideMoment", () => {
  const start = "2026-10-13T15:30:00Z";
  const end = "2026-10-13T19:30:00Z";

  it("cuenta los minutos que faltan antes de salir", () => {
    expect(guideMoment(start, end, new Date("2026-10-13T15:04:30Z"))).toEqual({
      kind: "before",
      minutesUntil: 26,
    });
  });

  it("da el avance y lo que queda en ruta", () => {
    expect(guideMoment(start, end, new Date("2026-10-13T16:30:00Z"))).toEqual({
      kind: "running",
      progress: 25,
      minutesLeft: 180,
    });
  });

  it("termina a la hora de fin", () => {
    expect(guideMoment(start, end, new Date(end))).toEqual({ kind: "ended" });
  });
});

describe("departureText", () => {
  it.each([
    [0, "Sale ahora"],
    [25, "Sale en 25 min"],
    [60, "Sale en 1 h"],
    [125, "Sale en 2 h 05 min"],
    [24 * 60 + 30, "Sale mañana"],
    [3 * 24 * 60, "Sale en 3 días"],
  ])("%i min → %s", (minutes, text) => {
    expect(departureText(minutes)).toBe(text);
  });
});

describe("allAboard y boardingText", () => {
  it("sin pasajeros no hay nadie a bordo", () => {
    expect(allAboard({ pax: 0, checkedIn: 0, noShows: 0 })).toBe(false);
    expect(boardingText({ pax: 0, checkedIn: 0, noShows: 0 })).toBe("Aún no hay pasajeros");
  });

  it("todos a bordo cuando los que faltan no se han presentado", () => {
    expect(allAboard({ pax: 6, checkedIn: 4, noShows: 2 })).toBe(true);
    expect(boardingText({ pax: 6, checkedIn: 4, noShows: 2 })).toBe("¡Todos a bordo!");
  });

  it("si nadie ha llegado y todos son «no vino», no es «a bordo»", () => {
    expect(allAboard({ pax: 2, checkedIn: 0, noShows: 2 })).toBe(false);
  });

  it("cuenta los que faltan", () => {
    expect(boardingText({ pax: 5, checkedIn: 0, noShows: 0 })).toBe("Esperando a 5 pasajeros");
    expect(boardingText({ pax: 5, checkedIn: 4, noShows: 0 })).toBe("Falta 1 por llegar");
    expect(boardingText({ pax: 5, checkedIn: 2, noShows: 0 })).toBe("Faltan 3 por llegar");
  });
});

describe("pickupStops", () => {
  it("agrupa por hotel sin distinguir mayúsculas y pone primero el punto de encuentro", () => {
    const stops = pickupStops(
      [
        booking({ id: "1", customerName: "Zoe", hotel: "Hotel Mar " }),
        booking({ id: "2", customerName: "Bea", hotel: "hotel  mar" }),
        booking({ id: "3", customerName: "Carlos", hotel: "" }),
        booking({
          id: "4",
          customerName: "Dani",
          hotel: "Apartamentos Sol",
          checkedIn: true,
        }),
        booking({
          id: "5",
          customerName: "Eva",
          hotel: "Hotel Mar",
          status: "cancelled",
        }),
      ],
      "Plaza del Ayuntamiento",
    );
    expect(stops.map((stop) => stop.name)).toEqual(["Plaza del Ayuntamiento", "Apartamentos Sol", "Hotel Mar"]);
    expect(stops[0]?.meetingPoint).toBe(true);
    expect(stops[2]?.bookings.map((item) => item.customerName)).toEqual(["Bea", "Zoe"]);
    expect(stops[2]?.pax).toBe(4);
    expect(stops[1]?.arrived).toBe(2);
  });

  it("sin punto de encuentro usa un nombre genérico", () => {
    expect(pickupStops([booking()], " ")[0]?.name).toBe("Punto de encuentro");
  });

  it("una parada está resuelta cuando no queda nadie por llegar", () => {
    const [stop] = pickupStops([booking({ checkedIn: true }), booking({ id: "2", noShow: true })], "");
    expect(stop?.noShows).toBe(1);
    expect(stopDone(stop ?? { bookings: [] })).toBe(true);
    expect(stopDone(pickupStops([booking()], "")[0] ?? { bookings: [] })).toBe(false);
  });
});

describe("parseManifestView", () => {
  it("por defecto, la hoja del guía", () => {
    expect(parseManifestView(undefined)).toBe("guia");
    expect(parseManifestView("otra")).toBe("guia");
    expect(parseManifestView("recogidas")).toBe("recogidas");
  });
});
