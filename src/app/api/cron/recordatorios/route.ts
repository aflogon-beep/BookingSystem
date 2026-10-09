import { rejectUnauthorizedCron } from "@/lib/cron";
import { sendReminders } from "@/lib/email/booking-emails";

// Job diario (vercel.json, 09:00 UTC): recordatorio por email a las reservas confirmadas de las
// salidas de mañana. Cada reserva lo recibe una sola vez (reminder_sent_at).
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const rejected = rejectUnauthorizedCron(request);
  if (rejected) return rejected;

  try {
    return Response.json(await sendReminders());
  } catch (error) {
    console.error("Los recordatorios fallaron", error instanceof Error ? error.message : "");
    return Response.json({ error: "No se pudieron enviar los recordatorios" }, { status: 500 });
  }
}
