import { describe, expect, it } from "vitest";

import { bookingTotal, initialPaymentStatus } from "./pricing";

describe("bookingTotal", () => {
  it("suma cantidad × precio en céntimos", () => {
    expect(bookingTotal([{ qty: 2, unitPriceCents: 6900 }, { qty: 1, unitPriceCents: 0 }, { qty: 3, unitPriceCents: 4500 }])).toBe(27300);
    expect(bookingTotal([])).toBe(0);
  });
});

describe("initialPaymentStatus", () => {
  it("la web queda pendiente hasta el pago", () => {
    expect(initialPaymentStatus("web", "card_online")).toBe("pending");
  });

  it("en el panel depende del método", () => {
    expect(initialPaymentStatus("desk", "cash")).toBe("paid");
    expect(initialPaymentStatus("phone", "card_terminal")).toBe("paid");
    expect(initialPaymentStatus("agency", "invoice")).toBe("invoice");
    expect(initialPaymentStatus("phone", "payment_link")).toBe("pending");
    expect(initialPaymentStatus("phone", null)).toBe("pending");
  });
});
