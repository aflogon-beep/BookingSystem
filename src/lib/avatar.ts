/** Colores de avatar del prototipo. */
const AVATAR_COLORS = ["#0A84FF", "#30B158", "#AF52DE", "#FF9F0A", "#FF375F", "#40A8C4", "#8E8E93"] as const;

/** Hasta dos iniciales en mayúscula: «Ana Pérez» → «AP». */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => [...word][0]?.toUpperCase() ?? "")
    .join("");
}

/** Color estable por nombre (mismo hash que el prototipo). */
export function avatarColor(name: string): string {
  const hash = [...name].reduce((acc, char) => (acc * 31 + (char.codePointAt(0) ?? 0)) >>> 0, 7);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? AVATAR_COLORS[0];
}
