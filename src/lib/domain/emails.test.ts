import { describe, expect, it } from "vitest";

import { bookingEmail, escapeHtml, reminderWindow, type BookingEmailData } from "./emails";

const data: BookingEmailData = {
  code: "VTAB12CD",
  customerName: "Lucía García Pérez",
  productName: "Teide al atardecer",
  // 16:30 en Canarias (verano, UTC+1).
  startsAt: "2026-10-14T15:30:00Z",
  language: "es",
  meetingPoint: "Plaza del Cristo, La Laguna",
  hotel: "",
  lines: [
    { name: "Adulto", qty: 2 },
    { name: "Niño", qty: 1 },
  ],
  totalCents: 18300,
  paymentStatus: "pending",
  business: { name: "Volcán Tours", email: "hola@volcan.test", phone: "+34 922 000 000", cancelHours: 24 },
};

describe("bookingEmail", () => {
  it("confirmación: código, fecha en Canarias, entradas, total y política", () => {
    const email = bookingEmail("confirmation", data);
    expect(email.subject).toBe("Reserva confirmada · Teide al atardecer · VTAB12CD");
    expect(email.text).toContain("Hola, Lucía:");
    expect(email.text).toContain("Te esperamos el miércoles 14 de octubre a las 16:30.");
    expect(email.text).toContain("Miércoles 14 de octubre · 16:30 · Español");
    expect(email.text).toContain("Punto de encuentro: Plaza del Cristo, La Laguna");
    expect(email.text).toContain("2 Adulto · 1 Niño");
    expect(email.text).toMatch(/Total: 183\s€, se paga el día de la excursión/);
    expect(email.text).toContain("Cancelación gratuita hasta 24 h antes de la salida.");
    expect(email.text).toContain("Para cualquier cambio, llama al +34 922 000 000 o escribe a hola@volcan.test.");
    expect(email.html).toContain("VTAB12CD");
    expect(email.html).toContain('<html lang="es">');
  });

  it("con recogida en hotel, la muestra en lugar del punto de encuentro", () => {
    const email = bookingEmail("confirmation", { ...data, hotel: "Hotel Mencey" });
    expect(email.text).toContain("Recogida en Hotel Mencey");
    expect(email.text).not.toContain("Punto de encuentro");
  });

  it("sin política de cancelación ni contacto, no los menciona", () => {
    const email = bookingEmail("confirmation", { ...data, business: { name: "Volcán Tours", email: "", phone: "", cancelHours: 0 } });
    expect(email.text).not.toContain("Cancelación gratuita");
    expect(email.text).not.toContain("Para cualquier cambio");
  });

  it("recordatorio: mañana y la hora", () => {
    const email = bookingEmail("reminder", { ...data, paymentStatus: "paid" });
    expect(email.subject).toBe("Mañana: Teide al atardecer a las 16:30");
    expect(email.text).toContain("mañana, miércoles 14 de octubre a las 16:30");
    expect(email.text).toMatch(/Pagado: 183\s€/);
  });

  it("cancelación: sin importe a pagar y con devolución si estaba pagada", () => {
    const pending = bookingEmail("cancellation", data);
    expect(pending.subject).toBe("Reserva cancelada · Teide al atardecer · VTAB12CD");
    expect(pending.text).toContain("del miércoles 14 de octubre a las 16:30 está cancelada");
    expect(pending.text).not.toContain("Total");
    expect(pending.text).not.toContain("devolveremos");
    expect(bookingEmail("cancellation", { ...data, paymentStatus: "paid" }).text).toContain("Te devolveremos lo que pagaste.");
  });

  it("escapa en el HTML lo que escribe el cliente o el equipo", () => {
    const email = bookingEmail("confirmation", { ...data, customerName: "<script>x</script>", hotel: 'Hotel "A&B"' });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(email.html).toContain("Hotel &quot;A&amp;B&quot;");
  });
});

describe("escapeHtml", () => {
  it("escapa los cinco caracteres especiales", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});

describe("reminderWindow", () => {
  it("es el día siguiente en hora de Canarias", () => {
    // 23:30 del 13 en Canarias (UTC+1): mañana es el 14.
    const window = reminderWindow(new Date("2026-10-13T22:30:00Z"));
    expect(window.date).toBe("2026-10-14");
    expect(window.from).toBe("2026-10-13T23:00:00.000Z");
    expect(window.to).toBe("2026-10-14T23:00:00.000Z");
  });

  it("cruza el cambio de hora de octubre", () => {
    // El 25 de octubre de 2026 Canarias pasa de UTC+1 a UTC+0.
    const window = reminderWindow(new Date("2026-10-24T09:00:00Z"));
    expect(window.date).toBe("2026-10-25");
    expect(window.from).toBe("2026-10-24T23:00:00.000Z");
    expect(window.to).toBe("2026-10-26T00:00:00.000Z");
  });
});
