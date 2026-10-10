import { describe, expect, it } from "vitest";

import { signSession, verifySession } from "./auth";
import { checkLogin, normalizeSlug, type LoginRestaurant } from "./login";
import { generatePin, hashPin, verifyPin } from "./pin.mjs";
import { sessionBinding } from "./session";

const keys = { demoPin: "4821", secret: "s".repeat(40) };
const demo: LoginRestaurant = { id: "d1111111-2222-4333-8444-555555555555", is_demo: true, panel_pin_hash: null, pin_locked_until: null };
const PIN = "73920418";
const real: LoginRestaurant = { id: "a1111111-2222-4333-8444-555555555555", is_demo: false, panel_pin_hash: hashPin(PIN), pin_locked_until: null };
const NOW = 1_800_000_000_000;

describe("PIN con hash", () => {
  it("el hash no contiene el PIN y verifica solo el PIN correcto", () => {
    const h = hashPin(PIN);
    expect(h).not.toContain(PIN);
    expect(h).toMatch(/^scrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
    expect(verifyPin(PIN, h)).toBe(true);
    expect(verifyPin("73920419", h)).toBe(false);
    expect(verifyPin("", h)).toBe(false);
  });
  it("cada hash lleva su propia sal", () => {
    expect(hashPin(PIN)).not.toBe(hashPin(PIN));
  });
  it("un hash con formato raro nunca verifica", () => {
    for (const bad of ["", "x", "scrypt$1$2", `${PIN}`, "scrypt$16384$8$1$AAAA$BBBB", null, undefined]) {
      expect(verifyPin(PIN, bad as string)).toBe(false);
    }
  });
  it("genera PIN de 8 dígitos", () => {
    for (let i = 0; i < 50; i++) expect(generatePin()).toMatch(/^\d{8}$/);
  });
});

describe("código del restaurante", () => {
  it("vacío es la demo; lo demás va en minúsculas y sin espacios", () => {
    expect(normalizeSlug("")).toBe("demo");
    expect(normalizeSlug("  ")).toBe("demo");
    expect(normalizeSlug(undefined)).toBe("demo");
    expect(normalizeSlug(" Soda-La-Esquina ")).toBe("soda-la-esquina");
  });
});

describe("inicio de sesión del panel", () => {
  it("la demo entra con PANEL_PIN", () => {
    expect(checkLogin({ slug: "demo", pin: "4821" }, demo, keys, NOW).ok).toBe(true);
    expect(checkLogin({ slug: "demo", pin: "0000" }, demo, keys, NOW).ok).toBe(false);
  });
  it("el PIN de la demo NUNCA abre un restaurante real", () => {
    const r = checkLogin({ slug: "soda", pin: keys.demoPin }, real, keys, NOW);
    expect(r).toEqual({ ok: false, reason: "bad_credentials" });
  });
  it("el PIN de un restaurante real no abre la demo", () => {
    expect(checkLogin({ slug: "demo", pin: PIN }, demo, keys, NOW).ok).toBe(false);
  });
  it("un restaurante real entra solo con su PIN", () => {
    expect(checkLogin({ slug: "soda", pin: PIN }, real, keys, NOW).ok).toBe(true);
    expect(checkLogin({ slug: "soda", pin: "73920419" }, real, keys, NOW).ok).toBe(false);
  });
  it("un restaurante real sin PIN configurado no deja entrar a nadie", () => {
    const sinPin = { ...real, panel_pin_hash: null };
    for (const pin of ["", "1234", keys.demoPin, PIN]) expect(checkLogin({ slug: "soda", pin }, sinPin, keys, NOW).ok).toBe(false);
  });
  it("un código que no existe responde igual que un PIN malo", () => {
    expect(checkLogin({ slug: "no-existe", pin: PIN }, null, keys, NOW)).toEqual({ ok: false, reason: "bad_credentials" });
  });
  it("con el bloqueo vigente no entra ni con el PIN correcto; vencido, sí", () => {
    const locked = { ...real, pin_locked_until: new Date(NOW + 5 * 60_000).toISOString() };
    const r = checkLogin({ slug: "soda", pin: PIN }, locked, keys, NOW);
    expect(r).toEqual({ ok: false, reason: "locked", retryAfterSec: 300 });
    expect(checkLogin({ slug: "soda", pin: PIN }, locked, keys, NOW + 6 * 60_000).ok).toBe(true);
  });
});

describe("aislamiento entre restaurantes", () => {
  const demoBinding = sessionBinding(demo, keys.demoPin)!;
  const realBinding = sessionBinding(real, keys.demoPin)!;
  it("la sesión de la demo no sirve para un restaurante real, aunque se cambie el id de la cookie", () => {
    const t = signSession(demo.id, demoBinding, keys.secret, NOW);
    const forged = t.replace(demo.id, real.id);
    expect(verifySession(t, demoBinding, keys.secret, NOW + 1)).toBe(true);
    expect(verifySession(forged, realBinding, keys.secret, NOW + 1)).toBe(false);
  });
  it("cambiar el PIN de un restaurante cierra sus sesiones", () => {
    const t = signSession(real.id, realBinding, keys.secret, NOW);
    const nuevo = sessionBinding({ ...real, panel_pin_hash: hashPin("11112222") }, keys.demoPin)!;
    expect(verifySession(t, nuevo, keys.secret, NOW + 1)).toBe(false);
  });
  it("cambiar PANEL_PIN cierra las sesiones de la demo pero no toca las de los reales", () => {
    const td = signSession(demo.id, demoBinding, keys.secret, NOW);
    const tr = signSession(real.id, realBinding, keys.secret, NOW);
    const bindingNuevoDemo = sessionBinding(demo, "9999")!;
    expect(verifySession(td, bindingNuevoDemo, keys.secret, NOW + 1)).toBe(false);
    expect(verifySession(tr, sessionBinding(real, "9999")!, keys.secret, NOW + 1)).toBe(true);
  });
  it("un restaurante real sin hash no tiene binding: no puede tener sesión", () => {
    expect(sessionBinding({ ...real, panel_pin_hash: null }, keys.demoPin)).toBeNull();
  });
});
