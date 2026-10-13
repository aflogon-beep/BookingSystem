import { describe, expect, it } from "vitest";

import { bookingsLabel, bulkResultMessage, bulkSummary, groupState, pruneSelection, toggleGroup, type BulkRow } from "@/lib/domain/booking-bulk";

const CHECK_IN = { one: "con check-in", many: "con check-in" };
const COLLECTED = { one: "cobrada", many: "cobradas" };

const row = (code: string, extra: Partial<BulkRow> = {}): BulkRow => ({
  id: `id-${code}`,
  code,
  status: "confirmed",
  paymentStatus: "pending",
  checkedIn: false,
  pax: 2,
  totalCents: 9000,
  paidCents: 0,
  ...extra,
});

const rows = [
  row("A"),
  row("B", { paymentStatus: "paid", paidCents: 9000, checkedIn: true }),
  row("C", { status: "cancelled" }),
  row("D", { status: "pending" }),
];

describe("bulkSummary", () => {
  it("cuenta lo marcado y separa lo que se puede hacer", () => {
    const summary = bulkSummary(rows, new Set(["A", "B", "C", "D"]));
    expect(summary.count).toBe(4);
    // La cancelada no suma personas ni importe.
    expect(summary.pax).toBe(6);
    expect(summary.totalCents).toBe(27000);
    // Solo las confirmadas: la de pago web a medias no hace check-in ni se cobra aquí.
    expect(summary.checkInIds).toEqual(["id-A"]);
    expect(summary.collectIds).toEqual(["id-A"]);
    expect(summary.collectCents).toBe(9000);
  });

  it("cobra solo lo que falta", () => {
    const summary = bulkSummary([row("E", { paidCents: 2000 })], new Set(["E"]));
    expect(summary.collectCents).toBe(7000);
  });

  it("nada marcado, nada que hacer", () => {
    const summary = bulkSummary(rows, new Set());
    expect(summary).toMatchObject({ count: 0, pax: 0, totalCents: 0, checkInIds: [], collectIds: [] });
  });
});

describe("toggleGroup y groupState", () => {
  it("marca el día entero y lo desmarca si ya estaba", () => {
    const all = toggleGroup(new Set(["A"]), ["A", "B"]);
    expect([...all].sort()).toEqual(["A", "B"]);
    expect(groupState(all, ["A", "B"])).toBe(true);
    const none = toggleGroup(all, ["A", "B"]);
    expect(none.size).toBe(0);
    expect(groupState(none, ["A", "B"])).toBe(false);
  });

  it("algunas marcadas es «mixed» y no toca otros días", () => {
    const selected = new Set(["A", "Z"]);
    expect(groupState(selected, ["A", "B"])).toBe("mixed");
    expect([...toggleGroup(selected, ["A", "B"])].sort()).toEqual(["A", "B", "Z"]);
  });
});

describe("pruneSelection", () => {
  it("quita las que ya no se ven", () => {
    expect([...pruneSelection(new Set(["A", "X"]), ["A", "B"])]).toEqual(["A"]);
  });
});

describe("textos", () => {
  it("singular y plural", () => {
    expect(bookingsLabel(1)).toBe("1 reserva");
    expect(bookingsLabel(3)).toBe("3 reservas");
  });

  it("resultado con y sin fallos", () => {
    expect(bulkResultMessage(3, 0, CHECK_IN)).toBe("3 reservas con check-in");
    expect(bulkResultMessage(2, 1, COLLECTED)).toBe("2 reservas cobradas; 1 no se pudo cambiar");
    expect(bulkResultMessage(1, 2, COLLECTED)).toBe("1 reserva cobrada; 2 no se pudieron cambiar");
    expect(bulkResultMessage(0, 2, COLLECTED)).toBe("No se pudo cambiar ninguna reserva");
  });
});
