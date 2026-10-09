import { artShapes } from "@/lib/product-art";
import { cn } from "@/lib/utils";

/** Foto del producto o, si no tiene, una ilustración de montañas con su color. */
export function ProductArt({
  seed,
  color,
  photoUrl,
  className,
}: {
  seed: string;
  color: string;
  photoUrl: string | null;
  className?: string;
}) {
  const classes = cn("block h-[150px] w-full object-cover", className);
  if (photoUrl) {
    // Fotos de Supabase Storage: next/image necesitaría configurar el dominio y no aporta aquí.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt="" decoding="async" className={classes} />;
  }
  const { sky, sun, layers } = artShapes(seed, color);
  const gradientId = `art-${seed.replace(/[^a-z0-9-]/gi, "")}`;
  return (
    <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true" className={classes}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky[0]} />
          <stop offset="1" stopColor={sky[1]} />
        </linearGradient>
      </defs>
      <rect width="400" height="200" fill={`url(#${gradientId})`} />
      <circle cx={sun.cx} cy={sun.cy} r={sun.r} fill={sun.fill} opacity={0.9} />
      {layers.map((layer) => (
        <polygon key={layer.fill} points={layer.points} fill={layer.fill} />
      ))}
    </svg>
  );
}
