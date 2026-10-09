/**
 * URL pública de la app. Los QR de las mesas se imprimen y se pegan en las mesas, así que
 * tienen que apuntar siempre al dominio estable de producción (APP_URL) y nunca a la URL de
 * un deploy específico. Por eso esta función NO mira VERCEL_URL ni VERCEL_BRANCH_URL.
 */
export function getAppUrl(): string {
  const raw = process.env.APP_URL?.trim();
  if (!raw) {
    throw new Error("Falta APP_URL (dominio de producción, por ejemplo https://demo-qr-steel.vercel.app)");
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`APP_URL no es una URL válida: ${raw}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`APP_URL debe empezar con http:// o https:// (recibido: ${raw})`);
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`APP_URL debe ser solo el dominio, sin ruta ni parámetros (recibido: ${raw})`);
  }
  if (process.env.VERCEL_ENV === "production" && url.protocol !== "https:") {
    throw new Error("En producción APP_URL debe usar https");
  }
  return url.origin;
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,64}$/;

/** URL que va dentro del QR de una mesa. */
export function tableUrl(qrToken: string): string {
  if (!TOKEN_PATTERN.test(qrToken)) {
    throw new RangeError("El token del QR no tiene el formato esperado");
  }
  return `${getAppUrl()}/m/${qrToken}`;
}
