import type { Locale } from "./i18n";

/**
 * Textos legales de la web (tarea 4.5): privacidad, aviso legal y condiciones, y cookies. Se rellenan
 * con los datos del titular de Ajustes. Son una base razonable para una pyme de tours en España;
 * conviene que los revise un profesional antes de abrir al público.
 */

export const LEGAL_DOCS = ["privacidad", "condiciones", "cookies"] as const;

export type LegalDoc = (typeof LEGAL_DOCS)[number];

/** Fecha de la última revisión de los textos (cámbiala al cambiarlos). */
export const LEGAL_UPDATED = "2026-10-10";

export function isLegalDoc(value: unknown): value is LegalDoc {
  return typeof value === "string" && (LEGAL_DOCS as readonly string[]).includes(value);
}

export type LegalInfo = {
  businessName: string;
  legalName: string;
  taxId: string;
  address: string;
  email: string;
  phone: string;
  cancelHours: number;
  retentionMonths: number;
};

export type LegalSection = { heading: string; paragraphs: string[] };

export type LegalDocument = { title: string; updated: string; sections: LegalSection[] };

export const LEGAL_TITLES: Record<Locale, Record<LegalDoc, string>> = {
  es: { privacidad: "Política de privacidad", condiciones: "Aviso legal y condiciones", cookies: "Política de cookies" },
  en: { privacidad: "Privacy policy", condiciones: "Legal notice and terms", cookies: "Cookie policy" },
};

/** «Volcán Tours S.L. (NIF B12345678), Calle …»: lo que haya rellenado en Ajustes. */
export function ownerLine(info: LegalInfo, locale: Locale): string {
  const name = info.legalName.trim() || info.businessName.trim();
  const taxId = info.taxId.trim() ? ` (${locale === "en" ? "Tax ID" : "NIF"} ${info.taxId.trim()})` : "";
  const address = info.address.trim() ? `, ${info.address.trim()}` : "";
  return `${name}${taxId}${address}`;
}

function contactLine(info: LegalInfo, locale: Locale): string {
  const parts = [info.email.trim(), info.phone.trim()].filter(Boolean);
  if (!parts.length) return locale === "en" ? "through the contact details on this website" : "con los datos de contacto de esta web";
  return parts.join(locale === "en" ? " or " : " o ");
}

function formatUpdated(locale: Locale): string {
  const [year, month, day] = LEGAL_UPDATED.split("-").map(Number);
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year ?? 2026, (month ?? 1) - 1, day ?? 1)),
  );
}

function cancellationText(hours: number, locale: Locale): string {
  if (locale === "en") {
    return hours > 0
      ? `You can cancel free of charge up to ${hours} hours before the tour starts. After that, or if you do not show up, the booking is not refunded.`
      : "Bookings cannot be cancelled free of charge. If you do not show up, the booking is not refunded.";
  }
  return hours > 0
    ? `Puedes cancelar gratis hasta ${hours} horas antes de la salida. Después, o si no te presentas, la reserva no se reembolsa.`
    : "Las reservas no tienen cancelación gratuita. Si no te presentas, la reserva no se reembolsa.";
}

const DOCUMENTS: Record<Locale, Record<LegalDoc, (info: LegalInfo) => LegalSection[]>> = {
  es: {
    privacidad: (info) => [
      {
        heading: "Quién trata tus datos",
        paragraphs: [`El responsable es ${ownerLine(info, "es")}. Puedes escribirnos ${contactLine(info, "es")}.`],
      },
      {
        heading: "Qué datos tratamos",
        paragraphs: [
          "Los que nos das al reservar: nombre, email, teléfono y, si lo indicas, el hotel de recogida y tus comentarios. No guardamos datos de tarjetas.",
        ],
      },
      {
        heading: "Para qué y con qué base",
        paragraphs: [
          "Para gestionar tu reserva: confirmarla, recordártela y avisarte si hay cambios o cancelaciones. La base legal es la ejecución del contrato que haces al reservar (artículo 6.1.b del RGPD). No te enviamos publicidad.",
        ],
      },
      {
        heading: "Cuánto tiempo los guardamos",
        paragraphs: [
          `Mientras tu reserva esté activa y ${info.retentionMonths} meses después de tu última excursión. Pasado ese plazo borramos tu nombre, email y teléfono; solo queda el registro de la reserva, sin datos que te identifiquen.`,
        ],
      },
      {
        heading: "Quién más los ve",
        paragraphs: [
          "Nuestro equipo y los proveedores que nos prestan el servicio (alojamiento de la web y de la base de datos, envío de emails), que tratan los datos por encargo nuestro y con las garantías del RGPD. No los cedemos a nadie más salvo obligación legal.",
        ],
      },
      {
        heading: "Tus derechos",
        paragraphs: [
          `Puedes pedirnos acceder a tus datos, corregirlos, borrarlos, oponerte a su uso, limitarlo o llevártelos, escribiéndonos ${contactLine(info, "es")}. Si crees que no los tratamos bien, puedes reclamar ante la Agencia Española de Protección de Datos (www.aepd.es).`,
        ],
      },
    ],
    condiciones: (info) => [
      {
        heading: "Quiénes somos",
        paragraphs: [`Esta web y las excursiones que vende son de ${ownerLine(info, "es")}. Contacto: ${contactLine(info, "es")}.`],
      },
      {
        heading: "Reserva y precio",
        paragraphs: [
          "La reserva queda hecha al confirmarla en la web: verás un código que te pedirán el día de la excursión. Los precios son finales por persona según el tipo de entrada, con impuestos incluidos.",
        ],
      },
      {
        heading: "Pago",
        paragraphs: ["Salvo que se indique otra cosa, pagas el total al guía el día de la excursión, antes de salir."],
      },
      { heading: "Cancelación por tu parte", paragraphs: [cancellationText(info.cancelHours, "es")] },
      {
        heading: "Cancelación o cambios por nuestra parte",
        paragraphs: [
          "Si tenemos que cancelar una salida (por ejemplo, por el tiempo o por no llegar al mínimo de personas), te avisamos y te ofrecemos otra fecha o la devolución íntegra de lo pagado.",
        ],
      },
      {
        heading: "El día de la excursión",
        paragraphs: [
          "Llega al punto de encuentro o a la recogida unos minutos antes de la hora. Sigue las indicaciones del guía; puede no admitir a quien ponga en riesgo la seguridad del grupo.",
        ],
      },
      {
        heading: "Ley aplicable",
        paragraphs: [
          "Estas condiciones se rigen por la ley española. Si eres consumidor, puedes acudir a los tribunales de tu domicilio y a las juntas arbitrales de consumo.",
        ],
      },
    ],
    cookies: () => [
      {
        heading: "Qué cookies usamos",
        paragraphs: [
          "No usamos cookies de análisis ni de publicidad, ni propias ni de terceros. Solo usamos cookies técnicas:",
          "«reservas_web»: al reservar, recuerda en tu navegador tus últimas reservas durante 30 días, para que solo tú puedas ver la página de confirmación.",
          "Las del panel interno del equipo, que mantienen la sesión iniciada de quien trabaja con nosotros.",
        ],
      },
      {
        heading: "Por qué no te pedimos permiso",
        paragraphs: [
          "Las cookies técnicas necesarias para un servicio están exentas de consentimiento (artículo 22.2 de la LSSI). Si algún día añadimos otras, te pediremos permiso antes.",
        ],
      },
    ],
  },
  en: {
    privacidad: (info) => [
      {
        heading: "Who handles your data",
        paragraphs: [`The controller is ${ownerLine(info, "en")}. You can contact us ${contactLine(info, "en")}.`],
      },
      {
        heading: "What data we handle",
        paragraphs: [
          "What you give us when you book: name, email, phone and, if you add them, your pickup hotel and comments. We do not store card details.",
        ],
      },
      {
        heading: "Why and on what basis",
        paragraphs: [
          "To manage your booking: confirm it, remind you of it and let you know about changes or cancellations. The legal basis is the contract you enter into when you book (article 6.1.b GDPR). We do not send you advertising.",
        ],
      },
      {
        heading: "How long we keep it",
        paragraphs: [
          `While your booking is active and for ${info.retentionMonths} months after your last tour. After that we delete your name, email and phone; only the booking record remains, without anything that identifies you.`,
        ],
      },
      {
        heading: "Who else sees it",
        paragraphs: [
          "Our team and the providers that run the service for us (website and database hosting, email delivery), who process the data on our behalf with GDPR safeguards. We do not share it with anyone else unless the law requires it.",
        ],
      },
      {
        heading: "Your rights",
        paragraphs: [
          `You can ask us to access, correct, delete, object to, restrict or port your data by contacting us ${contactLine(info, "en")}. If you think we are not handling it properly, you can complain to the Spanish Data Protection Agency (www.aepd.es).`,
        ],
      },
    ],
    condiciones: (info) => [
      {
        heading: "Who we are",
        paragraphs: [`This website and the tours it sells belong to ${ownerLine(info, "en")}. Contact: ${contactLine(info, "en")}.`],
      },
      {
        heading: "Booking and price",
        paragraphs: [
          "Your booking is made when you confirm it on the website: you will get a code to show on the day of the tour. Prices are final per person by ticket type, taxes included.",
        ],
      },
      {
        heading: "Payment",
        paragraphs: ["Unless stated otherwise, you pay the full amount to the guide on the day of the tour, before departure."],
      },
      { heading: "Cancellation by you", paragraphs: [cancellationText(info.cancelHours, "en")] },
      {
        heading: "Cancellation or changes by us",
        paragraphs: [
          "If we have to cancel a tour (for example, due to weather or not reaching the minimum group size), we will let you know and offer you another date or a full refund of what you paid.",
        ],
      },
      {
        heading: "On the day",
        paragraphs: [
          "Be at the meeting point or pickup a few minutes early. Follow the guide's instructions; the guide may refuse anyone who puts the group's safety at risk.",
        ],
      },
      {
        heading: "Governing law",
        paragraphs: [
          "These terms are governed by Spanish law. If you are a consumer, you can go to the courts where you live and to the Spanish consumer arbitration boards.",
        ],
      },
    ],
    cookies: () => [
      {
        heading: "Which cookies we use",
        paragraphs: [
          "We do not use analytics or advertising cookies, our own or third-party. We only use technical cookies:",
          "“reservas_web”: when you book, it remembers your latest bookings in your browser for 30 days, so that only you can see the confirmation page.",
          "Those of the team's internal panel, which keep our staff signed in.",
        ],
      },
      {
        heading: "Why we do not ask for consent",
        paragraphs: [
          "Technical cookies that a service needs are exempt from consent (article 22.2 of the Spanish LSSI). If we ever add others, we will ask for your permission first.",
        ],
      },
    ],
  },
};

export function legalDocument(doc: LegalDoc, locale: Locale, info: LegalInfo): LegalDocument {
  return { title: LEGAL_TITLES[locale][doc], updated: formatUpdated(locale), sections: DOCUMENTS[locale][doc](info) };
}
