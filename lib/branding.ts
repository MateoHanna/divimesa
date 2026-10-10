import { z } from "zod";

/** "#abc" o "#aabbcc" (mayúsculas o minúsculas) a "#aabbcc"; null si no es un color válido. */
export function normalizeHex(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  return m ? `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}` : null;
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Luminancia relativa WCAG de un color "#rrggbb". */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Color de texto con mejor contraste sobre el fondo dado (blanco o casi negro). */
export function readableOn(hex: string): "#ffffff" | "#111111" | "#000000" {
  const white = contrastRatio(hex, "#ffffff");
  const dark = contrastRatio(hex, "#111111");
  const best = white >= dark ? "#ffffff" : "#111111";
  if (Math.max(white, dark) >= 4.5) return best;
  // Tonos medios: ni el blanco ni el casi negro llegan a 4,5. El negro puro sí.
  return "#000000";
}

/** Variables CSS de la marca: el color del restaurante y el texto legible encima. */
export function brandVars(hex: string): Record<string, string> {
  const color = normalizeHex(hex) ?? "#D91E18";
  // --primary va directo: la variable de :root se resuelve ahí y no vería el --brand de este contenedor.
  return { "--brand": color, "--primary": color, "--primary-foreground": readableOn(color) };
}

/** Primera letra del nombre, para el círculo cuando no hay logo. */
export function initialOf(name: string): string {
  const m = /[\p{L}\p{N}]/u.exec(name.trim());
  return m ? m[0].toUpperCase() : "R";
}

export const brandingSchema = z.object({
  name: z.string().trim().min(1, "Escriba el nombre del restaurante.").max(80),
  primaryColor: z.string().transform((v, ctx) => {
    const n = normalizeHex(v);
    if (!n) ctx.addIssue({ code: "custom", message: "El color no es válido." });
    return n ?? "";
  }),
});

export const LOGO_MAX_BYTES = 1_048_576;

/** Tipo de imagen según los primeros bytes (no se confía en el tipo que manda el navegador). */
export function sniffImage(b: Uint8Array): { mime: "image/png" | "image/jpeg" | "image/webp"; ext: "png" | "jpg" | "webp" } | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { mime: "image/png", ext: "png" };
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return { mime: "image/webp", ext: "webp" };
  }
  return null;
}
