/** Ilustración de montañas para productos sin foto (función art() del prototipo). */

/** Mezcla dos colores #RRGGBB: t = 0 da `a`, t = 1 da `b`. */
export function hexMix(a: string, b: string, t: number): string {
  const A = parseInt(a.slice(1), 16);
  const B = parseInt(b.slice(1), 16);
  return `#${[16, 8, 0]
    .map((shift) => Math.round(((A >> shift) & 255) * (1 - t) + ((B >> shift) & 255) * t))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

function hash(value: string): number {
  return [...value].reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 7);
}

export type ArtShapes = {
  sky: [string, string];
  sun: { cx: number; cy: number; r: number; fill: string };
  layers: { points: string; fill: string }[];
};

/** Formas de la ilustración. Deterministas: la misma semilla y color dan siempre el mismo dibujo. */
export function artShapes(seed: string, color: string): ArtShapes {
  let x = hash(seed + color);
  const random = () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
  const sun = {
    cx: Math.round(70 + random() * 260),
    cy: Math.round(48 + random() * 18),
    r: Math.round(16 + random() * 10),
    fill: hexMix(color, "#FFF6E0", 0.55),
  };
  const layers = (
    [
      [0.18, 92],
      [0.45, 122],
      [0.78, 152],
    ] as const
  ).map(([tone, y]) => {
    const peaks = Array.from({ length: 11 }, (_, k) => `${k * 40},${(y - random() * (58 - tone * 30)).toFixed(1)}`);
    return { points: `0,200 ${peaks.join(" ")} 400,200`, fill: hexMix(color, "#0E1E2D", tone * 0.75) };
  });
  return { sky: [hexMix(color, "#FFFFFF", 0.55), hexMix(color, "#FFFFFF", 0.88)], sun, layers };
}
