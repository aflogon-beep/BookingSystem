"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { hasInAppHistory } from "@/components/navigation-progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * «Volver» a la pantalla de la que vienes (Reservas, el manifiesto, el buscador…). Si se abrió
 * directamente (enlace compartido, recarga), va a `fallbackHref`.
 */
export function BackLink({ fallbackHref, label = "Volver", className }: { fallbackHref: string; label?: string; className?: string }) {
  const router = useRouter();
  return (
    <Button asChild variant="ghost" size="sm" className={cn("-ml-1 px-1", className)}>
      <Link
        href={fallbackHref}
        onClick={(event) => {
          if (!hasInAppHistory() || event.metaKey || event.ctrlKey || event.shiftKey) return;
          event.preventDefault();
          router.back();
        }}
      >
        <ArrowLeft aria-hidden="true" />
        {label}
      </Link>
    </Button>
  );
}
