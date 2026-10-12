import { describe, expect, it } from "vitest";

import { parseProductInput } from "./product";
import {
  EMPTY_CONTENT,
  contentFromRow,
  linesToList,
  listToLines,
  localizeContent,
  localizedList,
  mapsUrl,
  moveItem,
  pageSections,
  photosFromRows,
  productContentSchema,
  stopsFromRows,
  unusedPhotos,
} from "./product-page";

const A = "00000000-0000-4000-8000-00000000000a.jpg";
const B = "00000000-0000-4000-8000-00000000000b.png";
const C = "00000000-0000-4000-8000-00000000000c.webp";

describe("linesToList", () => {
  it("una cosa por línea, sin vacías, espacios ni viñetas", () => {
    expect(linesToList("  Guía titulado \n\n- Transporte\r\n• Chocolate\n   ")).toEqual(["Guía titulado", "Transporte", "Chocolate"]);
  });

  it("vuelve a texto con listToLines", () => {
    expect(listToLines(linesToList(listToLines(["a", "b"])))).toBe("a\nb");
  });
});

describe("productContentSchema", () => {
  it("admite la ficha vacía", () => {
    expect(productContentSchema.safeParse(EMPTY_CONTENT).success).toBe(true);
  });

  it("limita las líneas de cada lista", () => {
    const result = productContentSchema.safeParse({ ...EMPTY_CONTENT, highlights: Array.from({ length: 13 }, (_, i) => `D${i}`) });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Lo más destacado: como mucho 12 líneas.");
  });

  it("rechaza una dificultad desconocida", () => {
    expect(productContentSchema.safeParse({ ...EMPTY_CONTENT, difficulty: "extrema" }).success).toBe(false);
  });
});

describe("producto con ficha web", () => {
  const base = {
    name: "Teide",
    description: "",
    meetingPoint: "",
    place: "",
    durationMin: 120,
    capacity: 10,
    minPax: 1,
    pickup: false,
    color: "#0A84FF",
    photoPath: A,
    active: true,
    prices: [{ ticketTypeId: "00000000-0000-4000-8000-000000000101", priceCents: 1000 }],
    rules: [],
  };
  const context = { languages: ["es"], ticketTypeIds: ["00000000-0000-4000-8000-000000000101"] };

  it("acepta galería, ficha e itinerario", () => {
    const parsed = parseProductInput(
      {
        ...base,
        gallery: [B, C],
        content: EMPTY_CONTENT,
        stops: [{ title: "Mirador", titleEn: "", description: "", descriptionEn: "", durationMin: 15 }],
      },
      context,
    );
    expect(parsed.ok).toBe(true);
  });

  it("una foto repetida lleva a la pestaña Fotos", () => {
    expect(parseProductInput({ ...base, gallery: [B, A] }, context)).toEqual({ ok: false, error: "Hay una foto repetida.", tab: "fotos" });
  });

  it("no hay galería sin portada", () => {
    expect(parseProductInput({ ...base, photoPath: null, gallery: [B] }, context)).toMatchObject({ ok: false, tab: "fotos" });
  });

  it("una parada sin título lleva a la pestaña Ficha web", () => {
    const parsed = parseProductInput(
      { ...base, stops: [{ title: " ", titleEn: "", description: "x", descriptionEn: "", durationMin: null }] },
      context,
    );
    expect(parsed).toEqual({ ok: false, error: "Cada parada del itinerario necesita un título.", tab: "ficha" });
  });

  it("como mucho 12 fotos", () => {
    const gallery = Array.from({ length: 12 }, (_, i) => `00000000-0000-4000-8000-0000000001${String(i).padStart(2, "0")}.jpg`);
    expect(parseProductInput({ ...base, gallery }, context)).toEqual({ ok: false, error: "Como mucho 12 fotos.", tab: "fotos" });
  });
});

describe("filas de la BD", () => {
  it("la portada va primero y la galería en su orden", () => {
    expect(
      photosFromRows(A, [
        { path: C, position: 2 },
        { path: B, position: 1 },
      ]),
    ).toEqual([A, B, C]);
    expect(photosFromRows(null, [{ path: B, position: 1 }])).toEqual([B]);
  });

  it("paradas en orden y dificultad desconocida como sin indicar", () => {
    const stops = stopsFromRows([
      { position: 2, title: "Fin", title_en: "", description: "", description_en: "", duration_min: null },
      { position: 1, title: "Inicio", title_en: "Start", description: "", description_en: "", duration_min: 30 },
    ]);
    expect(stops.map((stop) => stop.title)).toEqual(["Inicio", "Fin"]);
    const content = contentFromRow({
      tagline: "",
      tagline_en: "",
      highlights: [],
      highlights_en: [],
      included: [],
      included_en: [],
      not_included: [],
      not_included_en: [],
      bring: [],
      bring_en: [],
      good_to_know: "",
      good_to_know_en: "",
      difficulty: "otra",
    });
    expect(content.difficulty).toBeNull();
  });
});

describe("web en inglés", () => {
  it("usa la lista inglesa si tiene algo; si no, la española", () => {
    expect(localizedList("en", ["Guía"], ["Guide"])).toEqual(["Guide"]);
    expect(localizedList("en", ["Guía"], [])).toEqual(["Guía"]);
    expect(localizedList("es", ["Guía"], ["Guide"])).toEqual(["Guía"]);
  });

  it("traduce las paradas que tienen inglés", () => {
    const web = localizeContent("en", { ...EMPTY_CONTENT, tagline: "Hola", taglineEn: "Hi" }, [
      { title: "Inicio", titleEn: "Start", description: "Salida", descriptionEn: "", durationMin: 10 },
    ]);
    expect(web.tagline).toBe("Hi");
    expect(web.stops).toEqual([{ title: "Start", description: "Salida", durationMin: 10 }]);
  });
});

describe("utilidades", () => {
  it("mapsUrl codifica el lugar", () => {
    expect(mapsUrl(" Plaza del Cristo, La Laguna ")).toBe(
      "https://www.google.com/maps/search/?api=1&query=Plaza%20del%20Cristo%2C%20La%20Laguna",
    );
  });

  it("moveItem mueve sin salirse de la lista", () => {
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveItem(["a", "b"], 0, 5)).toEqual(["a", "b"]);
  });

  it("unusedPhotos devuelve las que ya no se usan", () => {
    expect(unusedPhotos([A, B, C], [B, null, A])).toEqual([C]);
    expect(unusedPhotos([], [A])).toEqual([]);
  });

  it("pageSections solo incluye lo que tiene contenido", () => {
    const web = localizeContent("es", { ...EMPTY_CONTENT, bring: ["Agua"] }, []);
    expect(pageSections(web, "  ", "Plaza")).toEqual(["meeting", "bring"]);
  });
});
