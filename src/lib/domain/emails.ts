import { addDays, format, parseISO } from "date-fns";

import { longDayLabel, rangeForDays, toBusinessDateTime } from "./calendar";
import { formatCents } from "./money";
import { businessToday } from "./schedule";
import { isLanguageCode, LANGUAGES } from "./settings";

export type BookingEmailKind = "confirmation" | "reminder" | "cancellation" | "change";

/** Lo que necesita un email de reserva, ya leído de la BD. */
export type BookingEmailData = {
  code: string;
  customerName: string;
  productName: string;
  startsAt: string;
  language: string;
  meetingPoint: string;
  /** Hotel de recogida (solo productos con recogida); vacío: punto de encuentro. */
  hotel: string;
  lines: { name: string; qty: number }[];
  totalCents: number;
  paymentStatus: string;
  business: { name: string; email: string; phone: string; cancelHours: number };
};

export type EmailContent = { subject: string; text: string; html: string };

/** Texto del historial de la reserva cuando sale cada email. */
export const EMAIL_EVENT_TEXT: Record<BookingEmailKind, string> = {
  confirmation: "Email de confirmación enviado",
  reminder: "Recordatorio enviado",
  cancellation: "Aviso de cancelación enviado",
  change: "Aviso de cambio de fecha enviado",
};

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/** Rango de instantes del día siguiente (hora de Canarias): las salidas que reciben recordatorio. */
export function reminderWindow(now: Date = new Date()): { date: string; from: string; to: string } {
  const date = format(addDays(parseISO(businessToday(now)), 1), "yyyy-MM-dd");
  return { date, ...rangeForDays([date]) };
}

function languageLabel(code: string): string {
  return isLanguageCode(code) ? LANGUAGES[code] : code.toUpperCase();
}

function paymentLine(data: BookingEmailData): string {
  switch (data.paymentStatus) {
    case "paid":
      return `Pagado: ${formatCents(data.totalCents)}`;
    case "invoice":
      return `Total: ${formatCents(data.totalCents)} (a factura)`;
    case "refunded":
      return `Total: ${formatCents(data.totalCents)} (devuelto)`;
    default:
      return `Total: ${formatCents(data.totalCents)}, se paga el día de la excursión`;
  }
}

function contactLine(business: BookingEmailData["business"]): string {
  const ways = [business.phone ? `llama al ${business.phone}` : "", business.email ? `escribe a ${business.email}` : ""].filter(Boolean);
  return ways.length ? `Para cualquier cambio, ${ways.join(" o ")}.` : "";
}

/** Asunto, texto y HTML de un email de reserva. En español (el inglés llega con la 2.5). */
export function bookingEmail(kind: BookingEmailKind, data: BookingEmailData): EmailContent {
  const { date, time } = toBusinessDateTime(data.startsAt);
  const day = longDayLabel(date);
  const when = `${day} a las ${time}`;
  const firstName = data.customerName.trim().split(/\s+/)[0] ?? "";
  const greeting = firstName ? `Hola, ${firstName}:` : "Hola:";
  const place = data.hotel
    ? `Recogida en ${data.hotel}`
    : data.meetingPoint
      ? `Punto de encuentro: ${data.meetingPoint}`
      : "";
  const tickets = data.lines.map((line) => `${line.qty} ${line.name}`).join(" · ");
  const contact = contactLine(data.business);

  let subject: string;
  let title: string;
  let intro: string[];
  let outro: string[];
  switch (kind) {
    case "confirmation":
      subject = `Reserva confirmada · ${data.productName} · ${data.code}`;
      title = "¡Reserva confirmada!";
      intro = [`Tu reserva para ${data.productName} está confirmada. Te esperamos el ${when}.`];
      outro = [
        "Guarda este email: te pediremos el código el día de la excursión.",
        data.business.cancelHours > 0 ? `Cancelación gratuita hasta ${data.business.cancelHours} h antes de la salida.` : "",
      ];
      break;
    case "reminder":
      subject = `Mañana: ${data.productName} a las ${time}`;
      title = "Tu excursión es mañana";
      intro = [`Te recordamos que mañana, ${when}, tienes ${data.productName}.`];
      outro = ["Llega unos minutos antes y ten a mano el código de reserva."];
      break;
    case "change":
      subject = `Cambio de fecha · ${data.productName} · ${data.code}`;
      title = "Tu reserva ha cambiado de fecha";
      intro = [`Hemos cambiado tu reserva de ${data.productName}. La nueva fecha es el ${when}.`];
      outro = ["Las entradas y el importe no cambian."];
      break;
    case "cancellation":
      subject = `Reserva cancelada · ${data.productName} · ${data.code}`;
      title = "Reserva cancelada";
      intro = [`Tu reserva para ${data.productName} del ${when} está cancelada.`];
      outro = [
        data.paymentStatus === "refunded" ? "Te devolvemos lo que pagaste." : "",
        "Sentimos las molestias. Si quieres, puedes reservar otra fecha en nuestra web.",
      ];
      break;
  }
  outro = [...outro, contact].filter(Boolean);

  const details = [
    `Código de reserva: ${data.code}`,
    data.productName,
    `${capitalize(day)} · ${time} · ${languageLabel(data.language)}`,
    place,
    tickets,
    kind === "cancellation" ? "" : paymentLine(data),
  ].filter(Boolean);

  const text = [greeting, "", ...intro, "", ...details, "", ...outro, "", data.business.name].join("\n");
  const html = renderHtml({ title, greeting, intro, code: data.code, details: details.slice(1), outro, signature: data.business.name });
  return { subject, text, html };
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function renderHtml(parts: {
  title: string;
  greeting: string;
  intro: string[];
  code: string;
  details: string[];
  outro: string[];
  signature: string;
}): string {
  const paragraph = (value: string) => `<p style="margin:0 0 12px">${escapeHtml(value)}</p>`;
  return `<!doctype html>
<html lang="es">
<body style="margin:0;padding:24px 12px;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1d1d1f;font-size:15px;line-height:1.5">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:24px">
<h1 style="margin:0 0 16px;font-size:22px">${escapeHtml(parts.title)}</h1>
${paragraph(parts.greeting)}
${parts.intro.map(paragraph).join("\n")}
<div style="margin:16px 0;padding:16px;border:1.5px dashed #a9c0f0;border-radius:12px;background:#eef3fd">
<div style="font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#6e6e73">Código de reserva</div>
<div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:22px;letter-spacing:0.06em;margin-bottom:8px">${escapeHtml(parts.code)}</div>
${parts.details.map((line) => `<div>${escapeHtml(line)}</div>`).join("\n")}
</div>
${parts.outro.map(paragraph).join("\n")}
<p style="margin:16px 0 0;color:#6e6e73">${escapeHtml(parts.signature)}</p>
</div>
</body>
</html>`;
}
