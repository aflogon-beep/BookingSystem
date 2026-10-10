import { describe, expect, it } from "vitest";

import {
  PAGE_SIZE,
  bookingListHref,
  bookingListQuery,
  bookingListSummary,
  bookingsCsv,
  csvFileName,
  ilikePattern,
  listDateLabel,
  parseBookingListParams,
  type BookingListParams,
} from "./booking-list";

const PRODUCT = "00000000-0000-4000-8000-000000000201";
const base: BookingListParams = { tab: "proximas", q: "", productId: null, channel: null, limit: PAGE_SIZE };
const now = new Date("2030-12-02T10:00:00Z");
const today = { from: "2030-12-02T00:00:00.000Z", to: "2030-12-03T00:00:00.000Z" };

describe("parseBookingListParams", () => {
  it("por defecto, próximas sin filtros", () => {
    expect(parseBookingListParams({})).toEqual(base);
  });

  it("lee pestaña, búsqueda, producto, canal y cuántas mostrar", () => {
    expect(
      parseBookingListParams({ pestana: "canceladas", q: "  Lucía ", producto: PRODUCT, canal: "agency", mostrar: "120" }),
    ).toEqual({ tab: "canceladas", q: "Lucía", productId: PRODUCT, channel: "agency", limit: 120 });
  });

  it("ignora lo que no vale", () => {
    expect(parseBookingListParams({ pestana: "x", producto: "1; drop", canal: "fax", mostrar: "-5" })).toEqual(base);
    expect(parseBookingListParams({ mostrar: "100000" }).limit).toBe(600);
  });
});

describe("bookingListHref", () => {
  it("solo pone lo que no está por defecto", () => {
    expect(bookingListHref(base)).toBe("/panel/reservas");
    expect(bookingListHref({ ...base, tab: "hoy", q: "ana pérez", channel: "web" })).toBe("/panel/reservas?pestana=hoy&q=ana+p%C3%A9rez&canal=web");
    expect(bookingListHref({ ...base, limit: 120 }, "/panel/reservas/csv")).toBe("/panel/reservas/csv?mostrar=120");
  });
});

describe("ilikePattern", () => {
  it("busca en minúsculas y sin comodines del usuario", () => {
    expect(ilikePattern("Ana")).toBe("%ana%");
    expect(ilikePattern("50%_a\\b")).toBe("%50\\%\\_a\\\\b%");
  });
});

describe("bookingListQuery", () => {
  const nowIso = now.toISOString();

  it("próximas: desde ahora y sin canceladas, de la más cercana a la más lejana", () => {
    expect(bookingListQuery(base, now, today)).toEqual({
      filters: [
        { column: "starts_at", operator: "gte", value: nowIso },
        { column: "status", operator: "neq", value: "cancelled" },
      ],
      ascending: true,
    });
  });

  it("hoy: las salidas del día en la hora del negocio, también canceladas", () => {
    expect(bookingListQuery({ ...base, tab: "hoy" }, now, today).filters).toEqual([
      { column: "starts_at", operator: "gte", value: today.from },
      { column: "starts_at", operator: "lt", value: today.to },
    ]);
  });

  it("pago pendiente, pasadas, canceladas y todas", () => {
    expect(bookingListQuery({ ...base, tab: "pendientes" }, now, today).filters).toContainEqual({
      column: "payment_status",
      operator: "eq",
      value: "pending",
    });
    expect(bookingListQuery({ ...base, tab: "pasadas" }, now, today)).toMatchObject({ ascending: false });
    expect(bookingListQuery({ ...base, tab: "canceladas" }, now, today)).toEqual({
      filters: [{ column: "status", operator: "eq", value: "cancelled" }],
      ascending: false,
    });
    expect(bookingListQuery({ ...base, tab: "todas" }, now, today)).toEqual({ filters: [], ascending: true });
  });

  it("añade producto, canal y búsqueda", () => {
    const { filters } = bookingListQuery({ ...base, tab: "todas", productId: PRODUCT, channel: "phone", q: "VT12" }, now, today);
    expect(filters).toEqual([
      { column: "product_id", operator: "eq", value: PRODUCT },
      { column: "channel", operator: "eq", value: "phone" },
      { column: "search_text", operator: "ilike", value: "%vt12%" },
    ]);
  });
});

describe("bookingListSummary", () => {
  it("cuenta todas las reservas, pero pasajeros e importe solo de las no canceladas", () => {
    expect(
      bookingListSummary([
        { status: "confirmed", pax: 2, totalCents: 5000 },
        { status: "cancelled", pax: 3, totalCents: 9000 },
        { status: "confirmed", pax: 1, totalCents: 2500 },
      ]),
    ).toEqual({ bookings: 3, pax: 3, totalCents: 7500 });
  });
});

describe("bookingsCsv", () => {
  it("separa con «;», usa coma decimal, traduce estados y empieza con BOM", () => {
    const csv = bookingsCsv([
      {
        code: "VT12AB34",
        date: "2030-12-02",
        time: "16:30",
        productName: 'Teide "estrellas"',
        language: "es",
        customerName: "=HYPERLINK()",
        email: "ana@example.com",
        phone: "+34 600 000 000",
        tickets: "2 adulto · 1 niño",
        pax: 3,
        totalCents: 12550,
        paymentStatus: "paid",
        channel: "phone",
        status: "confirmed",
      },
    ]);
    const [header, row] = csv.slice(1).split("\r\n");
    expect(csv.startsWith("﻿")).toBe(true);
    expect(header).toBe('"Código";"Fecha";"Hora";"Producto";"Idioma";"Cliente";"Email";"Teléfono";"Entradas";"Pax";"Importe";"Pago";"Canal";"Estado"');
    expect(row).toBe(
      '"VT12AB34";"2030-12-02";"16:30";"Teide ""estrellas""";"ES";"\'=HYPERLINK()";"ana@example.com";"\'+34 600 000 000";"2 adulto · 1 niño";"3";"125,50";"Pagada";"Teléfono";"Confirmada"',
    );
  });

  it("sin reservas, solo la cabecera", () => {
    expect(bookingsCsv([]).split("\r\n")).toHaveLength(2);
  });

  it("fecha corta del listado", () => {
    expect(listDateLabel("2030-12-02")).toBe("lun 2 dic");
  });

  it("nombre del archivo", () => {
    expect(csvFileName("proximas", "2030-12-02")).toBe("reservas-proximas-2030-12-02.csv");
  });
});
