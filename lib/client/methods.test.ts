import { describe, expect, it } from "vitest";
import { canDemoConfirm, confirmedByStaff, isComingSoon, orderedMethods } from "./methods";
import { toClientState } from "./state";
import type { PayMethod } from "./types";

// Respuestas con la misma forma que devuelve client_state en la base (ver supabase/tests/pilot_total.sql,
// donde se comprueba lo mismo contra Postgres).
const raw = (restaurant: Record<string, unknown>) => toClientState({
  view: "no_bill", table_number: 3, server_time: "2026-10-10T12:00:00Z", bill: null,
  restaurant: { name: "X", primary_color: "#000000", logo_url: null, ...restaurant },
} as never);

const real = raw({ sinpe: { number: "88887777", holder: "Soda La Esquina", test: false }, methods: ["sinpe", "terminal"] });
const demo = raw({ sinpe: { number: "00000000", holder: "Su Restaurante", test: true }, methods: ["card", "apple_pay", "google_pay", "sinpe", "terminal"] });

describe("métodos de pago por restaurante", () => {
  it("un restaurante real ofrece SINPE Móvil y tarjeta con el datáfono", () => {
    expect(orderedMethods(real.restaurant.methods)).toEqual(["sinpe", "terminal"]);
  });
  it("la demo ofrece los cinco, con SINPE Móvil primero y el datáfono después", () => {
    expect(orderedMethods(demo.restaurant.methods)).toEqual(["sinpe", "terminal", "card", "apple_pay", "google_pay"]);
    expect(orderedMethods(["google_pay", "card", "sinpe"])).toEqual(["sinpe", "card", "google_pay"]);
  });
  it("sin métodos en la respuesta (código viejo de la base), se asume la demo", () => {
    expect(raw({ sinpe: null }).restaurant.methods).toEqual(["card", "apple_pay", "google_pay", "sinpe"]);
  });
  it("ignora métodos desconocidos", () => {
    expect(orderedMethods(["bitcoin", "sinpe"] as unknown as PayMethod[])).toEqual(["sinpe"]);
  });
  it("tarjeta en línea, Apple Pay y Google Pay son 'Próximamente'; SINPE y datáfono no", () => {
    expect(isComingSoon("sinpe")).toBe(false);
    expect(isComingSoon("terminal")).toBe(false);
    for (const m of ["card", "apple_pay", "google_pay"] as const) expect(isComingSoon(m)).toBe(true);
  });
  it("SINPE y datáfono los confirma el salonero; los demás pasan por la pasarela", () => {
    expect(confirmedByStaff("sinpe")).toBe(true);
    expect(confirmedByStaff("terminal")).toBe(true);
    for (const m of ["card", "apple_pay", "google_pay"] as const) expect(confirmedByStaff(m)).toBe(false);
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

describe("pago propio por confirmar (my_sinpe)", () => {
  const open = (mySinpe: Record<string, unknown> | null) => toClientState({
    view: "open", table_number: 2, server_time: "2026-10-14T12:00:00Z",
    restaurant: { name: "X", primary_color: "#000000", sinpe: null, methods: ["terminal"] },
    bill: {
      id: "b1", status: "open", mode: "total", my_sinpe: mySinpe, lines: [],
      totals: { items_sum: 10000, subtotal: 10000, service: 0, vat: 0, total: 10000, paid: 0, balance: 10000 },
      split: null, amounts: { all: 10000, items_base: 10000 }, others_paying: false, paid_outside: 0,
    },
  } as never);
  const base = { id: "p1", status: "pending", amount: 10000, tip: 0, code: null, reported: true, kind: "full" };

  it("un datáfono pedido conserva su método", () => {
    expect(open({ ...base, method: "terminal" }).bill?.mySinpe?.method).toBe("terminal");
  });
  it("sin método (base anterior) es un SINPE", () => {
    expect(open(base).bill?.mySinpe?.method).toBe("sinpe");
  });
  it("sin pago propio queda en null", () => {
    expect(open(null).bill?.mySinpe).toBeNull();
  });
});
