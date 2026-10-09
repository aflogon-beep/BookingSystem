import { describe, expect, it } from "vitest";

import { artShapes, hexMix } from "./product-art";

describe("hexMix", () => {
  it("mezcla dos colores", () => {
    expect(hexMix("#000000", "#FFFFFF", 0)).toBe("#000000");
    expect(hexMix("#000000", "#FFFFFF", 1)).toBe("#ffffff");
    expect(hexMix("#0A84FF", "#FFFFFF", 0.5)).toBe("#85c2ff");
  });
});

describe("artShapes", () => {
  it("dibuja siempre lo mismo para el mismo producto", () => {
    expect(artShapes("abc", "#30B158")).toEqual(artShapes("abc", "#30B158"));
    expect(artShapes("abc", "#30B158")).not.toEqual(artShapes("abd", "#30B158"));
  });

  it("tiene tres capas de montaña dentro del lienzo 400×200", () => {
    const { layers, sun } = artShapes("teide", "#0A84FF");
    expect(layers).toHaveLength(3);
    for (const layer of layers) {
      const ys = layer.points.split(" ").map((point) => Number(point.split(",")[1]));
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...ys)).toBeLessThanOrEqual(200);
    }
    expect(sun.cx).toBeGreaterThanOrEqual(70);
    expect(sun.cx).toBeLessThanOrEqual(330);
  });
});
