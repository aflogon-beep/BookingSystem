/**
 * Esqueleto que se pinta al instante mientras el servidor prepara la página (loading.tsx).
 * Así la navegación responde enseguida aunque la consulta a la base de datos tarde.
 */
export function PageLoading({ cards = 3 }: { cards?: number }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-4">
      <span className="sr-only">Cargando…</span>
      <div className="h-7 w-48 animate-pulse rounded-lg bg-muted" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-[18px]">
        {Array.from({ length: cards }, (_, index) => (
          <div key={index} className="h-[190px] animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
