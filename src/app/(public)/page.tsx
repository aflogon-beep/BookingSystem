import { CalendarDays } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-start justify-center gap-6 px-4 py-16 sm:px-8">
      <p className="text-sm font-medium text-muted-foreground">Tenerife</p>
      <h1 className="text-4xl font-semibold tracking-tight">Ruta Reservas</h1>
      <p className="max-w-prose text-lg text-muted-foreground">
        Muy pronto podrás reservar aquí nuestros tours guiados.
      </p>
      <Button size="lg" className="rounded-full" disabled>
        <CalendarDays aria-hidden="true" />
        Ver experiencias
      </Button>
    </main>
  );
}
