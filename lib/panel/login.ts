import { DUMMY_HASH, verifyPin } from "./pin.mjs";
import { pinMatches } from "./auth";

export interface LoginRestaurant {
  id: string;
  is_demo: boolean;
  panel_pin_hash: string | null;
  pin_locked_until: string | null;
}

export type LoginResult =
  | { ok: true; restaurant: LoginRestaurant }
  | { ok: false; reason: "bad_credentials" }
  | { ok: false; reason: "locked"; retryAfterSec: number };

/** Código del restaurante tal como se guarda: minúsculas, sin espacios. Vacío significa la demo. */
export function normalizeSlug(input: string | null | undefined): string {
  const s = (input ?? "").trim().toLowerCase();
  return s === "" ? "demo" : s;
}

/**
 * Decide si un código + PIN entra. Separado de la ruta para poder probarlo sin base de datos.
 *  - La demo se verifica contra PANEL_PIN y solo abre el restaurante marcado is_demo.
 *  - Un restaurante real se verifica solo contra su hash. Sin hash no entra nadie.
 *  - Si el código no existe se hace igual el cálculo del hash, para que no se note la diferencia.
 */
export function checkLogin(
  input: { slug: string; pin: string },
  restaurant: LoginRestaurant | null,
  keys: { demoPin: string; secret: string },
  now: number = Date.now(),
): LoginResult {
  if (!restaurant) {
    verifyPin(input.pin, DUMMY_HASH);
    return { ok: false, reason: "bad_credentials" };
  }
  if (!restaurant.is_demo && restaurant.pin_locked_until) {
    const until = Date.parse(restaurant.pin_locked_until);
    if (until > now) return { ok: false, reason: "locked", retryAfterSec: Math.max(1, Math.ceil((until - now) / 1000)) };
  }
  const good = restaurant.is_demo
    ? pinMatches(input.pin, keys.demoPin, keys.secret)
    : restaurant.panel_pin_hash
      ? verifyPin(input.pin, restaurant.panel_pin_hash)
      : (verifyPin(input.pin, DUMMY_HASH), false);
  return good ? { ok: true, restaurant } : { ok: false, reason: "bad_credentials" };
}
