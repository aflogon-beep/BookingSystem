import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { getLocale } from "@/lib/i18n";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ruta Reservas",
  description: "Reserva tours guiados en Tenerife.",
};

// viewport-fit=cover para que env(safe-area-inset-*) funcione en iPhone (barra de pestañas).
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#f5f5f7",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // La web pública en inglés va bajo /en (el proxy pone el idioma); el resto, en español.
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans text-sm">{children}</body>
    </html>
  );
}
