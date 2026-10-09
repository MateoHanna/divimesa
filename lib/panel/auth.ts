import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "panel_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface Keys {
  pin: string;
  /** Secreto del servidor con el que se firma (la llave de servicio de Supabase). */
  secret: string;
}

function mac(secret: string, message: string): Buffer {
  return createHmac("sha256", secret).update(message).digest();
}

function equal(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Compara el PIN en tiempo constante (se comparan HMAC del mismo largo). */
export function pinMatches(input: string, pin: string, secret: string): boolean {
  return equal(mac(secret, `pin:${input}`), mac(secret, `pin:${pin}`));
}

/**
 * Token de sesión: "<expira>.<firma>". La firma incluye el PIN vigente, así que cambiar
 * PANEL_PIN invalida todas las sesiones abiertas.
 */
export function signSession(keys: Keys, now: number = Date.now(), ttlMs: number = SESSION_TTL_MS): string {
  const expires = now + ttlMs;
  return `${expires}.${mac(keys.secret, `panel:v1:${keys.pin}:${expires}`).toString("base64url")}`;
}

export function verifySession(token: string | undefined | null, keys: Keys, now: number = Date.now()): boolean {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot < 1) return false;
  const expiresText = token.slice(0, dot);
  if (!/^\d{10,15}$/.test(expiresText)) return false;
  const expires = Number(expiresText);
  if (expires <= now) return false;
  const given = Buffer.from(token.slice(dot + 1), "base64url");
  return equal(given, mac(keys.secret, `panel:v1:${keys.pin}:${expires}`));
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
