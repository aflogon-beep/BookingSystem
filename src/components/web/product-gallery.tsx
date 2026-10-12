"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { ChevronLeft, ChevronRight, Images, X } from "lucide-react";

import type { Locale } from "@/lib/domain/i18n";
import { webText, type WebText } from "@/lib/domain/web-text";
import { cn } from "@/lib/utils";

type GalleryText = WebText["gallery"];

/**
 * Cabecera de fotos de la ficha web, estilo GetYourGuide: en escritorio un mosaico (una grande y
 * hasta cuatro pequeñas) y en móvil un carrusel que se desliza con el dedo. Cualquier foto abre
 * el visor a pantalla completa, con flechas del teclado y botones. `children` va encima de las
 * fotos (título y botón de volver).
 */
export function ProductGallery({
  photos,
  name,
  locale,
  children,
}: {
  photos: string[];
  name: string;
  /** Los textos se eligen aquí: las funciones no pasan del servidor al cliente. */
  locale: Locale;
  children?: ReactNode;
}) {
  const text = webText(locale).gallery;
  const [open, setOpen] = useState<number | null>(null);
  const [current, setCurrent] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const count = photos.length;

  // Contador del carrusel móvil: la foto que ocupa más de media pantalla.
  function onScroll() {
    const track = trackRef.current;
    if (!track) return;
    setCurrent(Math.round(track.scrollLeft / Math.max(1, track.clientWidth)));
  }

  return (
    <div className="relative">
      {/* Móvil y tableta: carrusel a sangre. */}
      <div className="relative desk:hidden">
        <div
          ref={trackRef}
          onScroll={onScroll}
          role="group"
          aria-label={text.label}
          className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] tablet:rounded-[20px] [&::-webkit-scrollbar]:hidden"
        >
          {photos.map((url, index) => (
            <button
              key={url}
              type="button"
              onClick={() => setOpen(index)}
              aria-label={text.photoOf(index + 1, count)}
              className="w-full shrink-0 snap-center outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                decoding="async"
                loading={index === 0 ? "eager" : "lazy"}
                fetchPriority={index === 0 ? "high" : "auto"}
                className="block h-[300px] w-full object-cover tablet:h-[380px]"
              />
            </button>
          ))}
        </div>
        {count > 1 ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 font-mono text-[0.72rem] font-medium text-white backdrop-blur-sm"
          >
            <Images className="size-3.5" />
            {current + 1}/{count}
          </span>
        ) : null}
      </div>

      {/* Escritorio: mosaico de hasta cinco fotos, la portada grande a la izquierda. */}
      <div
        className={cn(
          "hidden h-[440px] gap-2 overflow-hidden rounded-[22px] desk:grid",
          count === 1 && "grid-cols-1",
          count === 2 && "grid-cols-[2fr_1fr]",
          count === 3 && "grid-cols-[2fr_1fr] grid-rows-2",
          count >= 4 && "grid-cols-[2fr_1fr_1fr] grid-rows-2",
        )}
      >
        {photos.slice(0, 5).map((url, index) => (
          <button
            key={url}
            type="button"
            onClick={() => setOpen(index)}
            aria-label={text.photoOf(index + 1, count)}
            className={cn(
              "group relative min-h-0 overflow-hidden outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset",
              index === 0 && count >= 3 && "row-span-2",
              // Con cuatro fotos, la última ocupa el ancho de las dos de abajo.
              index === 3 && count === 4 && "col-span-2",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt=""
              decoding="async"
              loading={index === 0 ? "eager" : "lazy"}
              fetchPriority={index === 0 ? "high" : "auto"}
              className="block h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
            />
          </button>
        ))}
      </div>

      {children}

      {count > 1 ? (
        <button
          type="button"
          onClick={() => setOpen(0)}
          className="absolute right-4 bottom-4 hidden items-center gap-1.5 rounded-full bg-white/95 px-3.5 py-2 text-[0.84rem] font-semibold text-foreground shadow-[0_6px_20px_rgb(0_0_0/0.18)] outline-none hover:bg-white focus-visible:ring-[3px] focus-visible:ring-ring/50 desk:inline-flex"
        >
          <Images aria-hidden="true" className="size-4" />
          {text.seeAll(count)}
        </button>
      ) : null}

      <Lightbox photos={photos} name={name} text={text} index={open} onIndex={setOpen} />
    </div>
  );
}

function Lightbox({
  photos,
  name,
  text,
  index,
  onIndex,
}: {
  photos: string[];
  name: string;
  text: GalleryText;
  index: number | null;
  onIndex: (index: number | null) => void;
}) {
  const count = photos.length;
  const touchX = useRef<number | null>(null);
  const go = (delta: number) => {
    if (index === null) return;
    onIndex((index + delta + count) % count);
  };

  // Se precarga la siguiente para que pasar de foto sea instantáneo.
  useEffect(() => {
    if (index === null || count < 2) return;
    const next = new Image();
    next.src = photos[(index + 1) % count] ?? "";
  }, [index, count, photos]);

  const url = index === null ? null : photos[index];

  return (
    <DialogPrimitive.Root open={index !== null} onOpenChange={(open) => (open ? null : onIndex(null))}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgb(6_10_16/0.94)] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") go(1);
            if (event.key === "ArrowLeft") go(-1);
          }}
          onTouchStart={(event) => {
            touchX.current = event.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(event) => {
            const start = touchX.current;
            const end = event.changedTouches[0]?.clientX;
            touchX.current = null;
            if (start === null || end === undefined || Math.abs(end - start) < 40) return;
            go(end < start ? 1 : -1);
          }}
          className="fixed inset-0 z-50 flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-white outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <DialogPrimitive.Title className="min-w-0 truncate text-[0.95rem] font-semibold">{name}</DialogPrimitive.Title>
            <span className="font-mono text-[0.8rem] text-white/70" aria-live="polite">
              {index === null ? null : text.photoOf(index + 1, count)}
            </span>
            <DialogPrimitive.Close
              aria-label={text.close}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-white/10 outline-none hover:bg-white/20 focus-visible:ring-[3px] focus-visible:ring-white/60"
            >
              <X aria-hidden="true" className="size-5" />
            </DialogPrimitive.Close>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 tablet:px-16">
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={url}
                src={url}
                alt={index === null ? "" : `${name} · ${text.photoOf(index + 1, count)}`}
                className="max-h-full max-w-full rounded-lg object-contain animate-in fade-in-0 duration-300"
              />
            ) : null}
            {count > 1 ? (
              <>
                <LightboxArrow label={text.previous} onClick={() => go(-1)} className="left-2 tablet:left-4">
                  <ChevronLeft aria-hidden="true" className="size-6" />
                </LightboxArrow>
                <LightboxArrow label={text.next} onClick={() => go(1)} className="right-2 tablet:right-4">
                  <ChevronRight aria-hidden="true" className="size-6" />
                </LightboxArrow>
              </>
            ) : null}
          </div>
          {count > 1 ? (
            <div className="flex justify-center gap-1.5 overflow-x-auto px-4 py-3 [scrollbar-width:none]">
              {photos.map((thumb, thumbIndex) => (
                <button
                  key={thumb}
                  type="button"
                  aria-label={text.photoOf(thumbIndex + 1, count)}
                  aria-current={thumbIndex === index ? "true" : undefined}
                  onClick={() => onIndex(thumbIndex)}
                  className={cn(
                    "size-12 shrink-0 overflow-hidden rounded-md opacity-50 outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-white",
                    thumbIndex === index && "opacity-100 ring-2 ring-white",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumb} alt="" loading="lazy" className="size-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function LightboxArrow({
  label,
  onClick,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  className: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "absolute top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/12 outline-none backdrop-blur-sm hover:bg-white/25 focus-visible:ring-[3px] focus-visible:ring-white/60",
        className,
      )}
    >
      {children}
    </button>
  );
}
