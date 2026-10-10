// PIN del panel: se guarda solo su hash (scrypt con sal propia). Este archivo es .mjs para que lo usen tanto la app
// como el script de alta (scripts/crear-restaurante.mjs) sin duplicar el formato.
import { randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 32;

/** PIN nuevo de 8 dígitos (100 millones de combinaciones). Solo se muestra una vez, en la terminal. */
export function generatePin() {
  return String(randomInt(0, 100_000_000)).padStart(8, "0");
}

/** "scrypt$N$r$p$sal$hash" (sal y hash en base64url). */
export function hashPin(pin) {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

/** Compara en tiempo constante. Devuelve false ante cualquier formato que no sea el esperado. */
export function verifyPin(pin, stored) {
  if (typeof pin !== "string" || typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, "base64url");
  if (expected.length !== KEYLEN) return false;
  try {
    const got = scryptSync(pin, Buffer.from(salt, "base64url"), KEYLEN, { N: Number(n), r: Number(r), p: Number(p) });
    return timingSafeEqual(got, expected);
  } catch {
    return false;
  }
}

// Hash de relleno: cuando el código del restaurante no existe se verifica contra este para que la respuesta tarde
// lo mismo y no se pueda adivinar qué códigos existen.
export const DUMMY_HASH = hashPin("relleno-sin-uso");
