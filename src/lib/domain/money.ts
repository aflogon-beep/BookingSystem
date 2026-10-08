const eurFormatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
});

/** Formatea un importe en céntimos (entero) como euros en es-ES: 1250 → "12,50 €". */
export function formatCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(`El importe debe ser un entero en céntimos: ${cents}`);
  }
  return eurFormatter.format(cents / 100);
}
