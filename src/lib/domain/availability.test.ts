import { describe, expect, it } from "vitest";

import { canBook, freeSeats, holdsSeats, occupiedSeats, seatsOf } from "./availability";

const NOW = new Date("2026-10-14T10:00:00Z");
const later = new Date("2026-10-14T10:20:00Z");
const earlier = new Date("2026-10-14T09:59:59Z");

describe("seatsOf", () => {
  it("las entradas sin plaza (bebé) no cuentan", () => {
    expect(seatsOf([{ qty: 2, takesSeat: true }, { qty: 1, takesSeat: false }])).toBe(2);
  });
});

describe("holdsSeats", () => {
  it("confirmadas sí; canceladas y caducadas no", () => {
    expect(holdsSeats({ status: "confirmed", holdExpiresAt: null }, NOW)).toBe(true);
    expect(holdsSeats({ status: "cancelled", holdExpiresAt: null }, NOW)).toBe(false);
    expect(holdsSeats({ status: "expired", holdExpiresAt: later }, NOW)).toBe(false);
  });

  it("pendientes solo con el bloqueo vigente", () => {
    expect(holdsSeats({ status: "pending", holdExpiresAt: later }, NOW)).toBe(true);
    expect(holdsSeats({ status: "pending", holdExpiresAt: earlier }, NOW)).toBe(false);
    expect(holdsSeats({ status: "pending", holdExpiresAt: NOW }, NOW)).toBe(false);
    expect(holdsSeats({ status: "pending", holdExpiresAt: null }, NOW)).toBe(false);
  });
});

describe("occupiedSeats", () => {
  it("suma confirmadas y bloqueos vigentes", () => {
    const seat = (qty: number) => [{ qty, takesSeat: true }];
    expect(
      occupiedSeats(
        [
          { status: "confirmed", holdExpiresAt: null, lines: [...seat(3), { qty: 1, takesSeat: false }] },
          { status: "pending", holdExpiresAt: later, lines: seat(2) },
          { status: "pending", holdExpiresAt: earlier, lines: seat(5) },
          { status: "cancelled", holdExpiresAt: null, lines: seat(4) },
        ],
        NOW,
      ),
    ).toBe(5);
  });
});

describe("plazas libres", () => {
  it("nunca negativas", () => {
    expect(freeSeats(16, 12)).toBe(4);
    expect(freeSeats(10, 12)).toBe(0);
  });

  it("la última plaza se puede reservar; una más, no", () => {
    expect(canBook(16, 15, 1)).toBe(true);
    expect(canBook(16, 15, 2)).toBe(false);
    expect(canBook(16, 16, 1)).toBe(false);
    expect(canBook(16, 0, 0)).toBe(false);
  });
});
