/** Evento para «Añadir a mi calendario» en la confirmación de la reserva web (como Amelia). */
export type CalendarEvent = {
  /** Identificador estable: el código de reserva. */
  uid: string;
  title: string;
  /** Instantes ISO (timestamptz de la salida). */
  start: string;
  end: string;
  location: string;
  details: string;
};

/** «20261014T153000Z»: formato UTC de Google Calendar e iCalendar. */
function utcStamp(instant: string): string {
  return new Date(instant).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Enlace que abre Google Calendar con el evento ya relleno. */
export function googleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${utcStamp(event.start)}/${utcStamp(event.end)}`,
    details: event.details,
    location: event.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Texto escapado según RFC 5545 (barra, punto y coma, coma y saltos de línea). */
function icsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Archivo .ics (Apple Calendar, Outlook…) con un único evento. */
export function icsFile(event: CalendarEvent, now: Date = new Date()): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ruta Reservas//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${icsText(event.uid)}@ruta-reservas`,
    `DTSTAMP:${utcStamp(now.toISOString())}`,
    `DTSTART:${utcStamp(event.start)}`,
    `DTEND:${utcStamp(event.end)}`,
    `SUMMARY:${icsText(event.title)}`,
    `LOCATION:${icsText(event.location)}`,
    `DESCRIPTION:${icsText(event.details)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
