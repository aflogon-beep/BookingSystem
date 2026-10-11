/** ✓ de «Reserva confirmada» que se dibuja al cargar, con un destello (sin animación si se pide menos movimiento). */
export function SuccessCheck() {
  return (
    <span aria-hidden="true" className="relative grid size-16 place-items-center">
      <span className="absolute inset-0 rounded-full bg-ok/25 motion-safe:animate-[success-ring_1.1s_ease-out_0.35s_both]" />
      <svg viewBox="0 0 52 52" className="relative size-16 motion-safe:animate-[success-pop_0.45s_cubic-bezier(0.34,1.56,0.64,1)_both]">
        <circle cx="26" cy="26" r="24" className="fill-ok" />
        <path
          d="M15 27 l7 7 l15 -16"
          fill="none"
          stroke="white"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          className="[stroke-dasharray:1] motion-safe:animate-[success-draw_0.4s_ease-out_0.3s_both]"
        />
      </svg>
    </span>
  );
}
