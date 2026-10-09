"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import type { DaySession } from "@/components/reservas/types";
import { requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/db/server";
import { sendBookingConfirmation, sendBookingEmail, sendCancellations } from "@/lib/email/booking-emails";
import { bookingErrorMessage, isPaymentAllowed, paymentMethodFor, type PaymentOption } from "@/lib/domain/booking-form";
import { bookingChangeError } from "@/lib/domain/booking-detail";
import { rangeForDays, toBusinessDateTime } from "@/lib/domain/calendar";
import { formatCents } from "@/lib/domain/money";

const dateSchema = z.iso.date();

const STATUSES = new Set<DaySession["status"]>(["open", "closed", "cancelled"]);

/** Salidas de un producto en un día (hora de Canarias), con sus plazas libres. */
export async function loadDaySessions(productId: string, date: string): Promise<DaySession[]> {
  await requireAccess("reservas");
  if (!z.uuid().safeParse(productId).success || !dateSchema.safeParse(date).success) return [];

  const supabase = await createClient();
  const { from, to } = rangeForDays([date]);
  const [{ data: sessions, error }, { data: availability, error: availabilityError }] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, starts_at, language, status")
      .eq("product_id", productId)
      .gte("starts_at", from)
      .lt("starts_at", to)
      .order("starts_at"),
    supabase
      .from("session_availability")
      .select("session_id, free_seats")
      .eq("product_id", productId)
      .gte("starts_at", from)
      .lt("starts_at", to),
  ]);
  if (error || availabilityError) throw new Error("No se pudieron cargar las salidas.");

  const free = new Map(availability.map((row) => [row.session_id, row.free_seats ?? 0]));
  const now = Date.now();
  return sessions.map((session) => ({
    id: session.id,
    time: toBusinessDateTime(session.starts_at).time,
    language: session.language,
    status: STATUSES.has(session.status as DaySession["status"]) ? (session.status as DaySession["status"]) : "closed",
    free: free.get(session.id) ?? 0,
    past: new Date(session.starts_at).getTime() <= now,
  }));
}

const optionalText = (max: number) => z.string().trim().max(max).optional().default("");

const bookingSchema = z
  .object({
    sessionId: z.uuid(),
    lines: z
      .array(z.object({ ticketTypeId: z.uuid(), qty: z.int().min(1).max(100) }))
      .min(1, "Añade al menos una entrada")
      .max(20),
    name: z.string().trim().min(1, "Escribe el nombre del cliente").max(120),
    email: z
      .string()
      .trim()
      .pipe(z.union([z.literal(""), z.email("El email no es válido").max(254)]))
      .optional()
      .default(""),
    phone: optionalText(40),
    hotel: optionalText(200),
    notes: optionalText(2000),
    channel: z.enum(["phone", "desk", "agency"]),
    agent: optionalText(120),
    payment: z.enum(["card_terminal", "cash", "payment_link", "on_site", "invoice"]),
  })
  .refine((input) => isPaymentAllowed(input.channel, input.payment as PaymentOption), {
    message: "Elige cómo se cobra",
    path: ["payment"],
  });

export type NewBookingInput = z.input<typeof bookingSchema>;
export type CreateBookingResult = { ok: true; code: string } | { ok: false; error: string };

const createdSchema = z.object({ id: z.uuid(), code: z.string() });

/** Crea una reserva confirmada desde el panel. Plazas, precios y total los decide la BD. */
export async function createInternalBooking(input: NewBookingInput): Promise<CreateBookingResult> {
  await requireAccess("reservas");
  const parsed = bookingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: validationMessage(parsed.error.issues[0]) };
  const data = parsed.data;

  const supabase = await createClient();
  const { data: created, error } = await supabase.rpc("create_booking_hold", {
    p_session_id: data.sessionId,
    p_lines: data.lines.map((line) => ({ ticket_type_id: line.ticketTypeId, qty: line.qty })),
    p_customer: { name: data.name, email: data.email, phone: data.phone },
    p_booking: {
      channel: data.channel,
      payment_method: paymentMethodFor(data.payment) ?? "",
      agent: data.agent,
      hotel: data.hotel,
      notes: data.notes,
    },
  });
  if (error) return { ok: false, error: bookingErrorMessage(error.code, error.hint) };

  const result = createdSchema.safeParse(created);
  if (!result.success) return { ok: false, error: "No se pudo crear la reserva. Inténtalo de nuevo." };
  after(() => sendBookingConfirmation(result.data.id));
  revalidatePath("/panel", "layout");
  return { ok: true, code: result.data.code };
}

// Solo los mensajes propios están en español; el resto (ids, cantidades) no debería llegar desde el formulario.
const OWN_MESSAGES = new Set(["name", "email", "payment", "lines"]);

function validationMessage(issue: z.core.$ZodIssue | undefined): string {
  return issue && issue.path.length === 1 && OWN_MESSAGES.has(String(issue.path[0])) ? issue.message : "Revisa los datos de la reserva.";
}

// Ficha de reserva ----------------------------------------------------------------------------

export type BookingActionResult = { ok: true; message: string } | { ok: false; error: string };

const uuid = z.uuid();

function changed(message: string): BookingActionResult {
  revalidatePath("/panel", "layout");
  return { ok: true, message };
}

/** Cancela una reserva; con `refund`, lo cobrado queda reembolsado. Avisa al cliente por email. */
export async function cancelBooking(bookingId: string, refund: boolean): Promise<BookingActionResult> {
  await requireAccess("reservas");
  if (!uuid.safeParse(bookingId).success || typeof refund !== "boolean") return { ok: false, error: bookingChangeError(undefined, undefined) };
  const supabase = await createClient();
  // Solo se avisa a quien tenía la reserva confirmada (no a un pago web a medias).
  const { data: before } = await supabase.from("bookings").select("status").eq("id", bookingId).maybeSingle();
  const { data, error } = await supabase.rpc("booking_cancel", { p_booking_id: bookingId, p_refund: refund });
  if (error) return { ok: false, error: bookingChangeError(error.code, error.hint) };
  if (before?.status === "confirmed") after(() => sendCancellations([bookingId]));
  return changed(data ? `Reserva cancelada · reembolsados ${formatCents(data)}` : "Reserva cancelada");
}

/** Cambia la reserva a otra salida del mismo producto. Avisa al cliente por email. */
export async function moveBooking(bookingId: string, sessionId: string): Promise<BookingActionResult> {
  await requireAccess("reservas");
  if (!uuid.safeParse(bookingId).success || !uuid.safeParse(sessionId).success) {
    return { ok: false, error: "Elige la nueva salida." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("booking_move", { p_booking_id: bookingId, p_session_id: sessionId });
  if (error) return { ok: false, error: bookingChangeError(error.code, error.hint) };
  after(() => sendBookingEmail("change", bookingId));
  return changed("Reserva cambiada de fecha");
}

const notesSchema = z.string().trim().max(2000, "Las notas no pueden pasar de 2000 caracteres.");

export async function saveBookingNotes(bookingId: string, notes: string): Promise<BookingActionResult> {
  await requireAccess("reservas");
  const parsed = notesSchema.safeParse(notes);
  if (!uuid.safeParse(bookingId).success) return { ok: false, error: bookingChangeError(undefined, undefined) };
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Notas no válidas." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("bookings").update({ notes: parsed.data }).eq("id", bookingId).select("id");
  if (error) return { ok: false, error: bookingChangeError(error.code, error.hint) };
  if (!data.length) return { ok: false, error: bookingChangeError("P0002", undefined) };
  return changed("Notas guardadas");
}

const RESEND_MESSAGES = {
  disabled: "Los emails aún no están configurados (falta la clave de Resend).",
  no_email: "Esta reserva no tiene email de cliente.",
  failed: "No se pudo enviar el email. Inténtalo de nuevo en unos minutos.",
} as const;

/** Reenvía la confirmación al cliente. */
export async function resendBookingConfirmation(bookingId: string): Promise<BookingActionResult> {
  await requireAccess("reservas");
  if (!uuid.safeParse(bookingId).success) return { ok: false, error: bookingChangeError(undefined, undefined) };
  // Con la sesión del equipo (RLS): que exista y se pueda ver antes de enviar con service role.
  const supabase = await createClient();
  const { data: booking } = await supabase.from("bookings").select("id").eq("id", bookingId).maybeSingle();
  if (!booking) return { ok: false, error: bookingChangeError("P0002", undefined) };
  const result = await sendBookingEmail("confirmation", bookingId, { again: true });
  if (result !== "sent") return { ok: false, error: RESEND_MESSAGES[result] };
  return changed("Confirmación reenviada");
}
