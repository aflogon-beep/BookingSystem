import { describe, expect, it } from "vitest";

import {
  bookingErrorMessage,
  canAddTicket,
  defaultPayment,
  isPaymentAllowed,
  paymentMethodFor,
  paymentNote,
  paymentOptions,
  selectedSeats,
} from "./booking-form";

const adult = { id: "a", takesSeat: true };
const baby = { id: "b", takesSeat: false };
const tickets = [adult, baby];

describe("cobro según el canal", () => {
  it("las agencias facturan o pagan en efectivo; el resto, TPV, efectivo, enlace o allí", () => {
    expect(paymentOptions("agency").map((option) => option.value)).toEqual(["invoice", "cash"]);
    expect(paymentOptions("phone").map((option) => option.label)).toEqual(["TPV tarjeta", "Efectivo", "Enlace de pago", "Paga allí"]);
    expect(defaultPayment("agency")).toBe("invoice");
    expect(defaultPayment("desk")).toBe("card_terminal");
    expect(isPaymentAllowed("phone", "invoice")).toBe(false);
    expect(isPaymentAllowed("agency", "cash")).toBe(true);
  });

  it("«Paga allí» no guarda método", () => {
    expect(paymentMethodFor("on_site")).toBeNull();
    expect(paymentMethodFor("payment_link")).toBe("payment_link");
    expect(paymentNote("invoice")).toBe("Se marcará para facturar a la agencia.");
  });
});

describe("entradas", () => {
  it("los bebés no ocupan plaza", () => {
    expect(selectedSeats(tickets, { a: 2, b: 1 })).toBe(2);
  });

  it("no deja pasar de las plazas libres, salvo entradas sin plaza", () => {
    expect(canAddTicket(adult, tickets, { a: 2 }, 3)).toBe(true);
    expect(canAddTicket(adult, tickets, { a: 3 }, 3)).toBe(false);
    expect(canAddTicket(baby, tickets, { a: 3 }, 3)).toBe(true);
    expect(canAddTicket(baby, tickets, { b: 100 }, 3)).toBe(false);
  });
});

describe("errores al crear la reserva", () => {
  it("RB001 dice cuántas plazas quedan", () => {
    expect(bookingErrorMessage("RB001", "0")).toBe("La salida se ha completado: ya no quedan plazas.");
    expect(bookingErrorMessage("RB001", "1")).toBe("Solo queda 1 plaza en esta salida.");
    expect(bookingErrorMessage("RB001", "4")).toBe("Solo quedan 4 plazas en esta salida.");
    expect(bookingErrorMessage("RB001", undefined)).toBe("No quedan plazas suficientes.");
    expect(bookingErrorMessage("RB001", "")).toBe("No quedan plazas suficientes.");
  });

  it("traduce el resto de códigos y da un mensaje genérico si no lo conoce", () => {
    expect(bookingErrorMessage("RB002", undefined)).toBe("Esta salida ya no admite reservas.");
    expect(bookingErrorMessage("42501", undefined)).toBe("No tienes permiso para crear reservas.");
    expect(bookingErrorMessage("XX000", undefined)).toBe("No se pudo crear la reserva. Inténtalo de nuevo.");
  });
});
