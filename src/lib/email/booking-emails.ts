import "server-only";

import { createAdminClient } from "@/lib/db/admin";
import { bookingEmail, EMAIL_EVENT_TEXT, reminderWindow, type BookingEmailData, type BookingEmailKind } from "@/lib/domain/emails";
import { parseEmailConfig } from "@/lib/env";

import { sendEmails, type OutgoingEmail } from "./resend";

// Los emails de reserva se leen y marcan con service role: los manda el servidor (tras una
// reserva, al cancelar o cambiar de fecha desde el panel o desde el cron), no la persona que
// está en el panel.

type Admin = ReturnType<typeof createAdminClient>;

const BOOKING_FIELDS =
  "id, code, total_cents, payment_status, hotel, customers(name, email), sessions(starts_at, language, products(name, meeting_point, pickup)), booking_lines(qty, ticket_types(name, sort))";
const CHUNK = 100;
const PAGE = 1000;

function emailsEnabled(): boolean {
  if (parseEmailConfig(process.env)) return true;
  console.warn("Emails desactivados: faltan RESEND_API_KEY o EMAIL_FROM (o no son válidas).");
  return false;
}

async function loadBusiness(admin: Admin): Promise<BookingEmailData["business"]> {
  const { data, error } = await admin.from("settings").select("business_name, email, phone, cancel_hours").eq("id", 1).single();
  if (error) throw new Error("No se pudieron leer los ajustes.");
  return { name: data.business_name, email: data.email, phone: data.phone, cancelHours: data.cancel_hours };
}

/** Lee las reservas y prepara un email por cada una que tenga email de cliente. */
async function prepare(
  admin: Admin,
  kind: BookingEmailKind,
  ids: readonly string[],
  keySuffix: string,
): Promise<(OutgoingEmail & { bookingId: string })[]> {
  if (!ids.length) return [];
  const [business, { data, error }] = await Promise.all([
    loadBusiness(admin),
    admin.from("bookings").select(BOOKING_FIELDS).in("id", ids),
  ]);
  if (error) throw new Error("No se pudieron leer las reservas.");

  return data.flatMap((booking) => {
    const customer = booking.customers;
    const session = booking.sessions;
    const product = session?.products;
    if (!customer?.email || !session || !product) return [];
    const lines = [...booking.booking_lines]
      .sort((a, b) => (a.ticket_types?.sort ?? 0) - (b.ticket_types?.sort ?? 0))
      .map((line) => ({ name: line.ticket_types?.name ?? "", qty: line.qty }));
    const content = bookingEmail(kind, {
      code: booking.code,
      customerName: customer.name,
      productName: product.name,
      startsAt: session.starts_at,
      language: session.language,
      meetingPoint: product.meeting_point,
      hotel: product.pickup ? booking.hotel : "",
      lines,
      totalCents: booking.total_cents,
      paymentStatus: booking.payment_status,
      business,
    });
    return [
      {
        ...content,
        bookingId: booking.id,
        to: customer.email,
        replyTo: business.email || undefined,
        // Con la fecha de la salida: tras un cambio de fecha vuelve a haber recordatorio.
        idempotencyKey: `${kind}/${booking.id}/${session.starts_at}${keySuffix}`,
      },
    ];
  });
}

/** Envía y apunta en el historial de cada reserva los que salieron. Devuelve los ids enviados. */
async function deliver(admin: Admin, kind: BookingEmailKind, ids: readonly string[], keySuffix = ""): Promise<Set<string>> {
  const sentIds = new Set<string>();
  for (let start = 0; start < ids.length; start += CHUNK) {
    const emails = await prepare(admin, kind, ids.slice(start, start + CHUNK), keySuffix);
    const accepted = await sendEmails(emails);
    for (const email of emails) if (accepted.has(email.idempotencyKey)) sentIds.add(email.bookingId);
  }
  if (sentIds.size) {
    const { error } = await admin
      .from("booking_events")
      .insert([...sentIds].map((bookingId) => ({ booking_id: bookingId, actor: "Sistema", text: EMAIL_EVENT_TEXT[kind] })));
    if (error) console.error("No se pudo apuntar el email en el historial", error.code);
  }
  return sentIds;
}

export type ResendResult = "sent" | "disabled" | "no_email" | "failed";

/**
 * Email de una reserva confirmada: la confirmación al crearla (web o panel), el aviso de cambio
 * de fecha o la confirmación reenviada a mano (`again`, que no la frena la idempotencia de
 * Resend). Nunca lanza.
 */
export async function sendBookingEmail(
  kind: "confirmation" | "change",
  bookingId: string,
  { again = false }: { again?: boolean } = {},
): Promise<ResendResult> {
  try {
    if (!emailsEnabled()) return "disabled";
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("bookings")
      .select("id, customers(email)")
      .eq("id", bookingId)
      .eq("status", "confirmed");
    if (error) throw new Error(error.code);
    const booking = data[0];
    if (!booking?.customers?.email) return "no_email";
    const sent = await deliver(admin, kind, [booking.id], again ? `/${Date.now()}` : "");
    return sent.size ? "sent" : "failed";
  } catch (error) {
    console.error("No se pudo enviar el email de la reserva", error instanceof Error ? error.message : "");
    return "failed";
  }
}

export async function sendBookingConfirmation(bookingId: string): Promise<void> {
  await sendBookingEmail("confirmation", bookingId);
}

/**
 * Marca (reminder_sent_at / cancellation_sent_at) solo las que nadie ha marcado antes, así dos
 * ejecuciones a la vez no envían dos veces. Si un envío falla, se desmarca: se puede reintentar
 * (volviendo a llamar al cron), pero nada lo reintenta solo. Es el mejor esfuerzo.
 */
async function claimAndDeliver(
  admin: Admin,
  kind: "reminder" | "cancellation",
  candidates: readonly string[],
): Promise<{ claimed: number; sent: number }> {
  const column = kind === "reminder" ? "reminder_sent_at" : "cancellation_sent_at";
  const mark = (value: string | null) => (kind === "reminder" ? { reminder_sent_at: value } : { cancellation_sent_at: value });
  let claimed = 0;
  let sent = 0;
  for (let start = 0; start < candidates.length; start += CHUNK) {
    const ids = candidates.slice(start, start + CHUNK);
    const { data, error } = await admin
      .from("bookings")
      .update(mark(new Date().toISOString()))
      .in("id", ids)
      .is(column, null)
      .select("id");
    if (error) throw new Error(error.code);
    const mine = data.map((row) => row.id);
    claimed += mine.length;
    let delivered = new Set<string>();
    try {
      delivered = await deliver(admin, kind, mine);
    } catch (error) {
      console.error("Falló el envío", error instanceof Error ? error.message : "");
    }
    sent += delivered.size;
    const failed = mine.filter((id) => !delivered.has(id));
    if (failed.length) {
      const { error: undoError } = await admin.from("bookings").update(mark(null)).in("id", failed);
      if (undoError) console.error("No se pudo desmarcar el envío fallido", undoError.code);
    }
  }
  return { claimed, sent };
}

/**
 * Aviso de cancelación a reservas que estaban confirmadas antes de cancelarlas (las lee quien
 * cancela, antes de llamar a session_set_status o booking_cancel): las web pendientes de pago
 * nunca llegaron a confirmarse y no se avisan. Nunca lanza.
 */
export async function sendCancellations(confirmedIds: readonly string[]): Promise<void> {
  try {
    if (!confirmedIds.length || !emailsEnabled()) return;
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("bookings")
      .select("id")
      .eq("status", "cancelled")
      .is("cancellation_sent_at", null)
      .in("id", [...confirmedIds]);
    if (error) throw new Error(error.code);
    await claimAndDeliver(admin, "cancellation", data.map((row) => row.id));
  } catch (error) {
    console.error("No se pudieron enviar los avisos de cancelación", error instanceof Error ? error.message : "");
  }
}

/** Recordatorio a las reservas confirmadas de las salidas de mañana (hora de Canarias). */
export async function sendReminders(now: Date = new Date()): Promise<{ date: string; enabled: boolean; claimed: number; sent: number }> {
  const { date, from, to } = reminderWindow(now);
  if (!emailsEnabled()) return { date, enabled: false, claimed: 0, sent: 0 };
  const admin = createAdminClient();
  // Por páginas: PostgREST devuelve como mucho 1000 filas por consulta.
  const ids: string[] = [];
  for (let page = 0; ; page += 1) {
    const { data, error } = await admin
      .from("bookings")
      .select("id, sessions!inner(starts_at, status)")
      .eq("status", "confirmed")
      .is("reminder_sent_at", null)
      .gte("sessions.starts_at", from)
      .lt("sessions.starts_at", to)
      .neq("sessions.status", "cancelled")
      .order("id")
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(`No se pudieron leer las reservas de mañana (${error.code})`);
    ids.push(...data.map((row) => row.id));
    if (data.length < PAGE) break;
  }
  const result = await claimAndDeliver(admin, "reminder", ids);
  return { date, enabled: true, ...result };
}
