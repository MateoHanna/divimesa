import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "panel_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function mac(secret: string, message: string): Buffer {
  return createHmac("sha256", secret).update(message).digest();
}

function equal(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Compara el PIN de la demo (variable PANEL_PIN) en tiempo constante (se comparan HMAC del mismo largo). */
export function pinMatches(input: string, pin: string, secret: string): boolean {
  return equal(mac(secret, `pin:${input}`), mac(secret, `pin:${pin}`));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Token de sesión: "<restaurante>.<expira>.<firma>". La firma cubre el restaurante y un "binding" que cambia cuando
 * cambia el PIN (el hash guardado del restaurante, o PANEL_PIN en la demo). Así:
 *  - una sesión solo vale para el restaurante que se firmó (no se puede cambiar el id en la cookie);
 *  - cambiar el PIN de un restaurante cierra sus sesiones abiertas;
 *  - el PIN de la demo nunca produce una sesión válida para otro restaurante.
 */
export function signSession(
  restaurantId: string,
  binding: string,
  secret: string,
  now: number = Date.now(),
  ttlMs: number = SESSION_TTL_MS,
): string {
  const expires = now + ttlMs;
  return `${restaurantId}.${expires}.${mac(secret, `panel:v2:${restaurantId}:${binding}:${expires}`).toString("base64url")}`;
}

/** Lee el token sin verificar la firma (para saber qué restaurante buscar). Nulo si el formato no es el esperado. */
export function parseSession(token: string | undefined | null): { restaurantId: string; expires: number; sig: string } | null {
  if (!token) return null;
  const [restaurantId, expiresText, sig, ...rest] = token.split(".");
  if (rest.length > 0 || !restaurantId || !expiresText || !sig) return null;
  if (!UUID.test(restaurantId) || !/^\d{10,15}$/.test(expiresText)) return null;
  return { restaurantId, expires: Number(expiresText), sig };
}

export function verifySession(
  token: string | undefined | null,
  binding: string,
  secret: string,
  now: number = Date.now(),
): boolean {
  const s = parseSession(token);
  if (!s || s.expires <= now) return false;
  const given = Buffer.from(s.sig, "base64url");
  return equal(given, mac(secret, `panel:v2:${s.restaurantId}:${binding}:${s.expires}`));
}

export function sessionCookieOptions(secure: boolean, ttlMs: number = SESSION_TTL_MS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: Math.floor(ttlMs / 1000),
  };
}
