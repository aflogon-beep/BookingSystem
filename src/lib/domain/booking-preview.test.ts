import { describe, expect, it } from "vitest";

import {
  BOOKING_CODE,
  adjacentCode,
  latestEvents,
  opensPreview,
  positionLabel,
  previewStamp,
  previewStep,
} from "@/lib/domain/booking-preview";

const codes = ["VT000001", "VT000002", "VT000003"];
const click = {
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
};

describe("adjacentCode", () => {
  it("da la reserva anterior y la siguiente", () => {
    expect(adjacentCode(codes, "VT000002", -1)).toBe("VT000001");
    expect(adjacentCode(codes, "VT000002", 1)).toBe("VT000003");
  });

  it("no da la vuelta en los extremos", () => {
    expect(adjacentCode(codes, "VT000001", -1)).toBeNull();
    expect(adjacentCode(codes, "VT000003", 1)).toBeNull();
  });

  it("null si la reserva ya no está en el listado", () => {
    expect(adjacentCode(codes, "VT999999", 1)).toBeNull();
  });
});

describe("positionLabel", () => {
  it("cuenta desde 1", () => {
    expect(positionLabel(codes, "VT000003")).toBe("3 de 3");
    expect(positionLabel(codes, "VT999999")).toBeNull();
  });
});

describe("previewStamp", () => {
  const row = {
    status: "confirmed",
    paymentStatus: "pending",
    checkedIn: false,
    totalCents: 9000,
    paidCents: 0,
  };

  it("cambia con el check-in y con el cobro", () => {
    const before = previewStamp(row);
    expect(previewStamp({ ...row, checkedIn: true })).not.toBe(before);
    expect(previewStamp({ ...row, paymentStatus: "paid", paidCents: 9000 })).not.toBe(before);
    expect(previewStamp({ ...row, totalCents: 12000 })).not.toBe(before);
  });

  it("es la misma si no cambia nada", () => {
    expect(previewStamp({ ...row })).toBe(previewStamp(row));
  });
});

describe("opensPreview", () => {
  it("un clic normal abre la vista previa", () => {
    expect(opensPreview(click)).toBe(true);
  });

  it("con teclas modificadoras o botón central se abre la ficha como enlace", () => {
    expect(opensPreview({ ...click, metaKey: true })).toBe(false);
    expect(opensPreview({ ...click, ctrlKey: true })).toBe(false);
    expect(opensPreview({ ...click, shiftKey: true })).toBe(false);
    expect(opensPreview({ ...click, altKey: true })).toBe(false);
    expect(opensPreview({ ...click, button: 1 })).toBe(false);
  });
});

describe("previewStep", () => {
  it("flechas y j/k mueven por el listado", () => {
    expect(previewStep("ArrowDown")).toBe(1);
    expect(previewStep("j")).toBe(1);
    expect(previewStep("ArrowUp")).toBe(-1);
    expect(previewStep("k")).toBe(-1);
    expect(previewStep("Enter")).toBeNull();
  });
});

describe("latestEvents", () => {
  it("los más recientes primero y como mucho tres", () => {
    const events = ["2026-10-01", "2026-10-04", "2026-10-02", "2026-10-03"].map((at, index) => ({ id: String(index), at }));
    expect(latestEvents(events).map((event) => event.at)).toEqual(["2026-10-04", "2026-10-03", "2026-10-02"]);
  });
});

describe("BOOKING_CODE", () => {
  it("acepta códigos de reserva y rechaza lo demás", () => {
    expect(BOOKING_CODE.test("VT7K2M9Q")).toBe(true);
    expect(BOOKING_CODE.test("vt7k2m9q")).toBe(false);
    expect(BOOKING_CODE.test("VT7K2M9Q'; --")).toBe(false);
  });
});
