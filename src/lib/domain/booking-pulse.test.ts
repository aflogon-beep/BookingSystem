import { describe, expect, it } from "vitest";

import { PAGE_SIZE, type BookingListParams } from "@/lib/domain/booking-list";
import {
  PULSE_DAYS,
  barPercent,
  buildPulse,
  collectedPercent,
  dayGroupLabel,
  groupByDay,
  isPulseDaySelected,
  pulseAxisLabel,
  pulseDayParams,
  pulseFilters,
  pulseWindow,
  showsPulse,
} from "@/lib/domain/booking-pulse";

const base: BookingListParams = { tab: "proximas", q: "", productId: null, channel: null, from: null, to: null, limit: PAGE_SIZE };
const today = "2026-10-12";

describe("pulseWindow", () => {
  it("por defecto son hoy y los 13 días siguientes", () => {
    const days = pulseWindow(base, today);
    expect(days).toHaveLength(PULSE_DAYS);
    expect(days[0]).toBe("2026-10-12");
    expect(days[13]).toBe("2026-10-25");
  });

  it("en «Pasadas» son los 14 días que acaban hoy", () => {
    const days = pulseWindow({ ...base, tab: "pasadas" }, today);
    expect(days[0]).toBe("2026-09-29");
    expect(days[13]).toBe("2026-10-12");
  });

  it("no se mueve al elegir un día que ya está en la ventana", () => {
    expect(pulseWindow({ ...base, from: "2026-10-20", to: "2026-10-20" }, today)[0]).toBe(today);
  });

  it("se va a las fechas del filtro si caen fuera", () => {
    expect(pulseWindow({ ...base, from: "2026-12-01", to: null }, today)[0]).toBe("2026-12-01");
    expect(pulseWindow({ ...base, from: null, to: "2026-08-31" }, today)[13]).toBe("2026-08-31");
  });
});

describe("pulseFilters", () => {
  const now = new Date("2026-10-12T09:00:00Z");
  const days = pulseWindow(base, today);

  it("quita las canceladas y limita a los días de la ventana, con los filtros del listado", () => {
    const filters = pulseFilters({ ...base, tab: "proximas", channel: "web" }, days, now);
    expect(filters).toContainEqual({ column: "status", operator: "neq", value: "cancelled" });
    expect(filters).toContainEqual({ column: "channel", operator: "eq", value: "web" });
    expect(filters).toContainEqual({ column: "starts_at", operator: "gte", value: "2026-10-11T23:00:00.000Z" });
    // Las de esta mañana también cuentan para hoy aunque ya hayan salido.
    expect(filters).not.toContainEqual({ column: "starts_at", operator: "gte", value: now.toISOString() });
  });

  it("en «Pago pendiente» solo cuenta lo pendiente de cobro", () => {
    expect(pulseFilters({ ...base, tab: "pendientes" }, days, now)).toContainEqual({ column: "payment_status", operator: "eq", value: "pending" });
  });

  it("no se enseña con las canceladas", () => {
    expect(showsPulse({ tab: "canceladas" })).toBe(false);
    expect(showsPulse({ tab: "todas" })).toBe(true);
  });
});

describe("buildPulse", () => {
  const days = ["2026-10-12", "2026-10-13", "2026-10-14"];

  it("suma por día (en hora de Canarias) y por producto, con los productos siempre en el mismo orden", () => {
    const pulse = buildPulse(
      [
        // 23:30 UTC del 12 = 00:30 del 13 en Canarias (horario de verano).
        { startsAt: "2026-10-12T23:30:00Z", productName: "Teide", productColor: "#f00", bookings: 2, pax: 5 },
        { startsAt: "2026-10-12T09:00:00Z", productName: "Anaga", productColor: "#0f0", bookings: 1, pax: 2 },
        { startsAt: "2026-10-12T15:00:00Z", productName: "Teide", productColor: "#f00", bookings: 1, pax: 3 },
        { startsAt: "2026-10-13T09:00:00Z", productName: "Anaga", productColor: "#0f0", bookings: 1, pax: 1 },
        { startsAt: "2026-10-20T09:00:00Z", productName: "Anaga", productColor: "#0f0", bookings: 9, pax: 40 },
      ],
      days,
    );
    expect(pulse.days.map((day) => day.pax)).toEqual([5, 6, 0]);
    expect(pulse.days[1]).toEqual({
      date: "2026-10-13",
      pax: 6,
      bookings: 3,
      segments: [
        { name: "Teide", color: "#f00", pax: 5 },
        { name: "Anaga", color: "#0f0", pax: 1 },
      ],
    });
    expect(pulse.days[0]?.segments.map((segment) => segment.name)).toEqual(["Teide", "Anaga"]);
    expect(pulse.legend).toEqual([
      { name: "Teide", color: "#f00" },
      { name: "Anaga", color: "#0f0" },
    ]);
    expect(pulse).toMatchObject({ maxPax: 6, totalPax: 11, totalBookings: 5, busiest: "2026-10-13" });
  });

  it("sin reservas no hay día más fuerte", () => {
    const pulse = buildPulse([], days);
    expect(pulse).toMatchObject({ maxPax: 0, totalPax: 0, busiest: null, legend: [] });
    expect(pulse.days).toHaveLength(3);
  });
});

describe("pulseDayParams", () => {
  it("lleva a ese día en la pestaña que le toca", () => {
    expect(pulseDayParams(base, today, today)).toMatchObject({ tab: "hoy", from: today, to: today });
    expect(pulseDayParams(base, "2026-10-15", today)).toMatchObject({ tab: "proximas", from: "2026-10-15", to: "2026-10-15" });
    expect(pulseDayParams({ ...base, tab: "todas" }, "2026-10-01", today)).toMatchObject({ tab: "pasadas", from: "2026-10-01" });
    expect(pulseDayParams({ ...base, tab: "pendientes" }, "2026-10-15", today)).toMatchObject({ tab: "pendientes" });
  });

  it("mantiene la búsqueda, el producto y el canal", () => {
    expect(pulseDayParams({ ...base, q: "ana", channel: "phone" }, "2026-10-15", today)).toMatchObject({ q: "ana", channel: "phone" });
  });

  it("pulsar el día elegido lo quita", () => {
    const selected = { ...base, from: "2026-10-15", to: "2026-10-15" };
    expect(isPulseDaySelected(selected, "2026-10-15", today)).toBe(true);
    expect(pulseDayParams(selected, "2026-10-15", today)).toMatchObject({ tab: "proximas", from: null, to: null });
    expect(isPulseDaySelected({ ...base, tab: "hoy" }, today, today)).toBe(true);
    expect(pulseDayParams({ ...base, tab: "hoy" }, today, today)).toMatchObject({ tab: "proximas", from: null, to: null });
  });

  it("un rango de varios días no marca ningún día", () => {
    expect(isPulseDaySelected({ ...base, from: "2026-10-15", to: "2026-10-16" }, "2026-10-15", today)).toBe(false);
  });
});

describe("barPercent y collectedPercent", () => {
  it("escala la barra al día más fuerte, con un mínimo visible", () => {
    expect(barPercent(10, 20)).toBe(50);
    expect(barPercent(1, 100)).toBe(6);
    expect(barPercent(0, 100)).toBe(0);
    expect(barPercent(3, 0)).toBe(0);
  });

  it("calcula el porcentaje cobrado sin pasar de 0–100", () => {
    expect(collectedPercent(2500, 10000)).toBe(25);
    expect(collectedPercent(12000, 10000)).toBe(100);
    expect(collectedPercent(0, 0)).toBe(0);
  });
});

describe("etiquetas", () => {
  it("nombra hoy, mañana y ayer; el resto, con el día de la semana", () => {
    expect(dayGroupLabel(today, today)).toEqual({ title: "Hoy", detail: "lunes 12 oct" });
    expect(dayGroupLabel("2026-10-13", today).title).toBe("Mañana");
    expect(dayGroupLabel("2026-10-11", today).title).toBe("Ayer");
    expect(dayGroupLabel("2026-10-17", today)).toEqual({ title: "sábado 17 oct", detail: "" });
  });

  it("eje del gráfico: inicial del día y número", () => {
    expect(pulseAxisLabel("2026-10-14")).toEqual({ weekday: "X", dayOfMonth: "14" });
  });
});

describe("groupByDay", () => {
  it("agrupa filas seguidas del mismo día; las canceladas no suman pasajeros ni importe", () => {
    const groups = groupByDay([
      { date: "2026-10-12", status: "confirmed", pax: 2, totalCents: 4000 },
      { date: "2026-10-12", status: "cancelled", pax: 3, totalCents: 6000 },
      { date: "2026-10-14", status: "confirmed", pax: 1, totalCents: 2000 },
    ]);
    expect(groups.map(({ date, bookings, pax, totalCents }) => ({ date, bookings, pax, totalCents }))).toEqual([
      { date: "2026-10-12", bookings: 2, pax: 2, totalCents: 4000 },
      { date: "2026-10-14", bookings: 1, pax: 1, totalCents: 2000 },
    ]);
  });
});
