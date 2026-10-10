import { describe, expect, it } from "vitest";

import { checkSetupStep, newSetupDraft, parseSetup, parseSetupInput, ticketOptions, type SetupDraft } from "./setup";

const CONTEXT = { usedLanguages: [], hasGuides: false, nextTicketSort: 1, existingTicketIds: [] as string[] };

function draft(overrides: Partial<SetupDraft> = {}): SetupDraft {
  const base = newSetupDraft({ businessName: "Laguna Walks", currency: "EUR", languages: ["en", "es"] }, ticketOptions([]));
  return {
    ...base,
    guides: [{ name: "Ana", languages: ["es", "en"] }],
    tour: { ...base.tour, name: "Casco de La Laguna", meetingPoint: "Plaza del Adelantado", times: "17:00, 10:00" },
    ...overrides,
  };
}

describe("asistente de configuración", () => {
  it("propone las entradas del prototipo si no hay ninguna, y si las hay usa las existentes", () => {
    expect(ticketOptions([]).map((ticket) => [ticket.ref, ticket.on, ticket.price])).toEqual([
      ["adult", true, "45"],
      ["child", true, "25"],
      ["infant", true, "0"],
      ["resident", false, "36"],
    ]);
    expect(ticketOptions([{ id: "t1", name: "General", note: "", takesSeat: true }])).toEqual([
      { ref: "t1", name: "General", note: "", takesSeat: true, on: true, price: "" },
    ]);
  });

  it("el borrador parte de los ajustes actuales, con los idiomas en orden", () => {
    const base = newSetupDraft({ businessName: "Volcán Tours", currency: "EUR", languages: ["de", "es"] }, []);
    expect(base.languages).toEqual(["es", "de"]);
    expect(base.tour.language).toBe("es");
    expect(base.guides).toEqual([{ name: "", languages: ["es"] }]);
  });

  it("valida cada paso con los textos del prototipo", () => {
    expect(checkSetupStep(1, draft({ businessName: "  " }), CONTEXT)).toBe("Escribe el nombre de tu empresa.");
    expect(checkSetupStep(1, draft({ languages: [] }), CONTEXT)).toBe("Elige al menos un idioma.");
    expect(checkSetupStep(1, draft({ currency: "JPY" }), CONTEXT)).toBe("Moneda no admitida.");
    expect(checkSetupStep(2, draft({ tickets: ticketOptions([]).map((ticket) => ({ ...ticket, on: false })) }), CONTEXT)).toBe(
      "Elige al menos un tipo de entrada.",
    );
    expect(checkSetupStep(3, draft({ guides: [{ name: "Ana", languages: [] }] }), CONTEXT)).toBe("Cada guía necesita al menos un idioma.");
    // Un guía en un idioma que ya no es del negocio tampoco vale.
    expect(checkSetupStep(3, draft({ guides: [{ name: "Ana", languages: ["de"] }] }), CONTEXT)).toBe("Cada guía necesita al menos un idioma.");
    expect(checkSetupStep(3, draft({ vehicles: [{ name: "Minibús", seats: "0" }] }), CONTEXT)).toBe("Las plazas de cada vehículo van de 1 a 100.");
    // Filas sin nombre: se ignoran.
    expect(checkSetupStep(3, draft({ guides: [{ name: " ", languages: [] }], vehicles: [{ name: "", seats: "" }] }), CONTEXT)).toBeNull();

    const tour = draft().tour;
    expect(checkSetupStep(4, draft({ tour: { ...tour, name: "" } }), CONTEXT)).toBe("Ponle nombre al tour.");
    expect(checkSetupStep(4, draft({ tour: { ...tour, durationMin: "10" } }), CONTEXT)).toBe("La duración va de 15 a 1440 minutos.");
    expect(checkSetupStep(4, draft({ tour: { ...tour, minPax: "20" } }), CONTEXT)).toBe("El mínimo no puede ser mayor que el aforo.");
    expect(checkSetupStep(4, draft({ tour: { ...tour, weekdays: [] } }), CONTEXT)).toBe("Elige al menos un día.");
    expect(checkSetupStep(4, draft({ tour: { ...tour, times: "a las diez" } }), CONTEXT)).toBe(
      "Escribe al menos una hora de salida, por ejemplo 10:00.",
    );
    expect(checkSetupStep(4, draft({ tour: { ...tour, language: "de" } }), CONTEXT)).toBe("Elige el idioma del tour.");
    const badPrice = ticketOptions([]).map((ticket) => (ticket.ref === "child" ? { ...ticket, price: "veinte" } : ticket));
    expect(checkSetupStep(4, draft({ tickets: badPrice }), CONTEXT)).toBe("Escribe el precio de Niño (por ejemplo, 45 o 45,50).");
  });

  it("no deja quitar un idioma que ya usan los horarios", () => {
    expect(checkSetupStep(1, draft({ languages: ["es"] }), { ...CONTEXT, usedLanguages: ["en"] })).toBe(
      "Ya hay horarios en inglés: no lo quites (puedes cambiarlos luego en Productos).",
    );
  });

  it("convierte el asistente en lo que guarda complete_setup", () => {
    const result = parseSetup(
      draft({ vehicles: [{ name: " Minibús 01 ", seats: "16" }, { name: "", seats: "8" }], guides: [{ name: " Ana ", languages: ["en", "es", "de"] }] }),
      { ...CONTEXT, nextTicketSort: 3 },
    );
    expect(result).toEqual({
      ok: true,
      value: {
        settings: { business_name: "Laguna Walks", currency: "EUR", languages: ["es", "en"] },
        ticket_types: [
          { key: "adult", name: "Adulto", note: "13 años o más", takes_seat: true, sort: 3 },
          { key: "child", name: "Niño", note: "4 a 12 años", takes_seat: true, sort: 4 },
          { key: "infant", name: "Bebé", note: "0 a 3 años, en brazos", takes_seat: false, sort: 5 },
        ],
        resources: [
          { name: "Ana", type: "guide", seats: 1, languages: ["es", "en"] },
          { name: "Minibús 01", type: "vehicle", seats: 16, languages: [] },
        ],
        product: {
          name: "Casco de La Laguna",
          description: "",
          meeting_point: "Plaza del Adelantado",
          place: "",
          duration_min: 180,
          capacity: 12,
          min_pax: 2,
          pickup: false,
          color: "#0A84FF",
          photo_path: null,
          active: true,
          needs: { guide: 1, vehicle: 1, equipment: 0 },
        },
        prices: [
          { ticket: "adult", price_cents: 4500 },
          { ticket: "child", price_cents: 2500 },
          { ticket: "infant", price_cents: 0 },
        ],
        rules: [{ weekdays: [1, 2, 3, 4, 5, 6], times: ["10:00", "17:00"], language: "es", valid_from: null, valid_to: null }],
      },
    });
  });

  it("sin guías ni vehículos el tour no los necesita, salvo que ya haya guías", () => {
    const noTeam = draft({ guides: [{ name: "", languages: ["es"] }] });
    const alone = parseSetup(noTeam, CONTEXT);
    expect(alone.ok && alone.value.product.needs).toEqual({ guide: 0, vehicle: 0, equipment: 0 });
    const withGuides = parseSetup(noTeam, { ...CONTEXT, hasGuides: true });
    expect(withGuides.ok && withGuides.value.product.needs).toEqual({ guide: 1, vehicle: 0, equipment: 0 });
  });

  it("con entradas ya creadas usa sus ids y no crea tipos nuevos", () => {
    const tickets = ticketOptions([
      { id: "t1", name: "Adulto", note: "", takesSeat: true },
      { id: "t2", name: "Niño", note: "", takesSeat: true },
    ]).map((ticket) => ({ ...ticket, price: ticket.ref === "t1" ? "30" : "15,5", on: true }));
    const result = parseSetup(draft({ tickets }), { ...CONTEXT, existingTicketIds: ["t1", "t2"] });
    expect(result.ok && result.value.ticket_types).toEqual([]);
    expect(result.ok && result.value.prices).toEqual([
      { ticket: "t1", price_cents: 3000 },
      { ticket: "t2", price_cents: 1550 },
    ]);
  });

  it("rechaza entradas que no existen y dice en qué paso está el error", () => {
    const forged = [...ticketOptions([]), { ref: "vip", name: "VIP", note: "", takesSeat: true, on: true, price: "100" }];
    expect(parseSetup(draft({ tickets: forged }), CONTEXT)).toEqual({ ok: false, error: "Los tipos de entrada han cambiado. Recarga la página.", step: 2 });
    expect(parseSetup(draft({ businessName: "" }), CONTEXT)).toEqual({ ok: false, error: "Escribe el nombre de tu empresa.", step: 1 });
    const stale = parseSetup(draft(), { ...CONTEXT, existingTicketIds: ["t1"] });
    expect(stale.ok).toBe(false);
  });

  it("rechaza lo que no tiene la forma del borrador", () => {
    expect(parseSetupInput({ businessName: "x" }, CONTEXT)).toEqual({ ok: false, error: "Datos no válidos. Recarga la página.", step: 1 });
    expect(parseSetupInput(draft(), CONTEXT).ok).toBe(true);
  });
});
