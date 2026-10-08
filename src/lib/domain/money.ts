const baseOptions = {
  style: "currency",
  currency: "EUR",
  signDisplay: "negative",
} as const satisfies Intl.NumberFormatOptions;

const wholeEuros = new Intl.NumberFormat("es-ES", {
  ...baseOptions,
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const withCents = new Intl.NumberFormat("es-ES", {
  ...baseOptions,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formatea un importe en céntimos (entero) como euros en es-ES, igual que el prototipo:
 * sin decimales en euros enteros (4500 → "45 €") y con dos si hay céntimos (1250 → "12,50 €").
 */
export function formatCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(`El importe debe ser un entero en céntimos: ${cents}`);
  }
  const formatter = cents % 100 === 0 ? wholeEuros : withCents;
  return formatter.format(cents / 100);
}
