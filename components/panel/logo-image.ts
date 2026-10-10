// Reduce el logo en el navegador antes de subirlo: máximo 512 px y bien por debajo de 1 MB.
const MAX_SIDE = 512;
const MAX_BYTES = 900_000;

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function prepareLogo(file: File): Promise<File> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("logo_type");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("logo_type");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  let blob = await toBlob(canvas, "image/png");
  if (blob && blob.size > MAX_BYTES) {
    // PNG demasiado pesado (foto): se pasa a JPG sobre fondo blanco.
    const flat = document.createElement("canvas");
    flat.width = w;
    flat.height = h;
    const c2 = flat.getContext("2d");
    if (c2) {
      c2.fillStyle = "#fff";
      c2.fillRect(0, 0, w, h);
      c2.drawImage(canvas, 0, 0);
      blob = await toBlob(flat, "image/jpeg", 0.85);
    }
  }
  if (!blob || blob.size > MAX_BYTES) throw new Error("logo_too_big");
  const ext = blob.type === "image/jpeg" ? "jpg" : "png";
  return new File([blob], `logo.${ext}`, { type: blob.type });
}
