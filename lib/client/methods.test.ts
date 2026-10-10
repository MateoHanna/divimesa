import { describe, expect, it } from "vitest";
import { canDemoConfirm, isComingSoon, orderedMethods } from "./methods";
import { toClientState } from "./state";
import type { PayMethod } from "./types";

// Respuestas con la misma forma que devuelve client_state en la base (ver supabase/tests/pilot_total.sql,
// donde se comprueba lo mismo contra Postgres).
const raw = (restaurant: Record<string, unknown>) => toClientState({
  view: "no_bill", table_number: 3, server_time: "2026-10-10T12:00:00Z", bill: null,
  restaurant: { name: "X", primary_color: "#000000", logo_url: null, ...restaurant },
} as never);

const real = raw({ sinpe: { number: "88887777", holder: "Soda La Esquina", test: false }, methods: ["sinpe"] });
const demo = raw({ sinpe: { number: "00000000", holder: "Su Restaurante", test: true }, methods: ["card", "apple_pay", "google_pay", "sinpe"] });

describe("métodos de pago por restaurante", () => {
  it("un restaurante real solo ofrece SINPE Móvil", () => {
    expect(orderedMethods(real.restaurant.methods)).toEqual(["sinpe"]);
  });
  it("la demo ofrece los cuatro, con SINPE Móvil primero", () => {
    expect(orderedMethods(demo.restaurant.methods)).toEqual(["sinpe", "card", "apple_pay", "google_pay"]);
    expect(orderedMethods(["google_pay", "card", "sinpe"])).toEqual(["sinpe", "card", "google_pay"]);
  });
  it("ignora métodos desconocidos", () => {
    expect(orderedMethods(["bitcoin", "sinpe"] as unknown as PayMethod[])).toEqual(["sinpe"]);
  });
  it("tarjeta, Apple Pay y Google Pay son 'Próximamente'; SINPE no", () => {
    expect(isComingSoon("sinpe")).toBe(false);
    for (const m of ["card", "apple_pay", "google_pay"] as const) expect(isComingSoon(m)).toBe(true);
  });
});

describe("botón de salonero de la demo", () => {
  it("nunca aparece en un restaurante real, ni siquiera dentro de la página de demo", () => {
    expect(canDemoConfirm(real, false)).toBe(false);
    expect(canDemoConfirm(real, true)).toBe(false);
  });
  it("tampoco aparece si el restaurante no tiene SINPE configurado", () => {
    expect(canDemoConfirm(raw({ sinpe: null, methods: ["sinpe"] }), true)).toBe(false);
  });
  it("aparece solo en la demo, con el número de prueba", () => {
    expect(canDemoConfirm(demo, true)).toBe(true);
    expect(canDemoConfirm(demo, false)).toBe(false);
  });
});
