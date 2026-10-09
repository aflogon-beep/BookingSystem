"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import type { DaySession } from "@/components/reservas/types";
import { requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/db/server";
import { sendBookingConfirmation } from "@/lib/email/booking-emails";
import { bookingErrorMessage, isPaymentAllowed, paymentMethodFor, type PaymentOption } from "@/lib/domain/booking-form";
import { rangeForDays, toBusinessDateTime } from "@/lib/domain/calendar";

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
