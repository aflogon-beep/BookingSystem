import { Mail, MessageCircle, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { mailtoHref, telHref, whatsappHref } from "@/lib/domain/contact";
import { cn } from "@/lib/utils";

/** Llamar, WhatsApp y email con un toque. Solo salen los que tienen un dato válido. */
export function ContactButtons({
  name,
  phone,
  email,
  compact = false,
  className,
}: {
  name: string;
  phone: string | null;
  email: string | null;
  /** Solo iconos (filas del manifiesto). */
  compact?: boolean;
  className?: string;
}) {
  const links = [
    { href: phone ? telHref(phone) : null, label: "Llamar", icon: Phone, external: false },
    { href: phone ? whatsappHref(phone) : null, label: "WhatsApp", icon: MessageCircle, external: true },
    { href: email ? mailtoHref(email) : null, label: "Email", icon: Mail, external: false },
  ].filter((link): link is typeof link & { href: string } => link.href !== null);
  if (!links.length) return null;

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {links.map(({ href, label, icon: Icon, external }) => (
        <Button key={label} asChild variant="outline" size={compact ? "icon-sm" : "sm"}>
          <a
            href={href}
            aria-label={`${label} a ${name}`}
            title={compact ? label : undefined}
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            <Icon aria-hidden="true" />
            {compact ? null : label}
          </a>
        </Button>
      ))}
    </div>
  );
}

/** Teléfono pulsable (llama) con un acceso a WhatsApp al lado, para filas de tablas. */
export function PhoneLinks({ name, phone, className }: { name: string; phone: string; className?: string }) {
  const tel = telHref(phone);
  const whatsapp = whatsappHref(phone);
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {tel ? (
        <a href={tel} aria-label={`Llamar a ${name}`} className="font-mono underline-offset-2 hover:underline">
          {phone}
        </a>
      ) : (
        <span className="font-mono">{phone}</span>
      )}
      {whatsapp ? (
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`WhatsApp a ${name}`}
          title="WhatsApp"
          className="-m-1.5 grid size-8 flex-none place-items-center rounded-full text-ok hover:bg-ok-soft"
        >
          <MessageCircle aria-hidden="true" className="size-4" />
        </a>
      ) : null}
    </span>
  );
}
