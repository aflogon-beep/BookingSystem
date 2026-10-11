import { photoTargetSize } from "@/lib/domain/product";

const QUALITY = 0.82;

/**
 * Reduce una foto en el navegador antes de subirla: lado mayor de 1600 px y WebP. Las fotos de
 * móvil pasan de varios MB a unos cientos de KB, y la web (sobre todo con datos móviles) carga
 * mucho antes. Si el navegador no puede convertirla, o la convertida no pesa menos, se sube la
 * original tal cual.
 */
export async function compressPhoto(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const { width, height } = photoTargetSize(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", QUALITY));
    // Safari antiguo devuelve PNG si no sabe hacer WebP: entonces se queda la original.
    if (!blob || blob.type !== "image/webp" || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]*$/, "") + ".webp", { type: "image/webp" });
  } catch {
    return file;
  }
}
