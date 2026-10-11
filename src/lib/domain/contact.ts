/**
 * Enlaces para contactar con un cliente con un toque (llamar, WhatsApp, email).
 * Los teléfonos llegan tal cual los escribió el cliente: «+44 7700 900123», «612 34 56 78», «0034…».
 */

/** Teléfono en formato internacional sin «+» (lo que pide wa.me), o null si no parece un teléfono. */
export function internationalDigits(phone: string): string | null {
  const trimmed = phone.trim();
  let digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) {
    // ya trae prefijo
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (/^[6789]\d{8}$/.test(digits)) {
    // Número español sin prefijo: lo normal en el negocio.
    digits = `34${digits}`;
  }
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export function telHref(phone: string): string | null {
  const digits = internationalDigits(phone);
  return digits ? `tel:+${digits}` : null;
}

export function whatsappHref(phone: string): string | null {
  const digits = internationalDigits(phone);
  return digits ? `https://wa.me/${digits}` : null;
}

export function mailtoHref(email: string): string | null {
  const trimmed = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? `mailto:${trimmed}` : null;
}
