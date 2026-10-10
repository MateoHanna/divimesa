import { describe, expect, it } from "vitest";

import { formatCRC } from "../money";
import { createMockProvider, MOCK_SIGNATURE_HEADER, signMockBody } from "../payments/mock";
import { mapClientError } from "./errors";
import { approxShare, earliestReservation, quote, selectableLines, tipFor } from "./quote";
import { toClientState } from "./state";
import type { ClientLine, ClientState } from "./types";

const line = (id: string, amount: number, o: Partial<ClientLine> = {}): ClientLine => ({
  id, name: "Plato", amount, status: "pending", reserved: "none", reservedUntil: null, splitGroupId: null, ...o,
});

function stateWith(o: { paidOutside?: number; balance?: number; all?: number; itemsBase?: number; split?: ClientState["bill"] extends infer B ? (B extends { split: infer S } ? S : never) : never; lines?: ClientLine[] } = {}): ClientState {
  const lines = o.lines ?? [line("a", 5500), line("b", 5500), line("c", 6200)];
  const balance = o.balance ?? 21156;
  return {
    view: "open", tableNumber: 2, serverTime: "2026-10-09T12:00:00Z", outcome: null,
  billId: "b1",
    restaurant: { name: "Demo", primaryColor: "#0f766e", logoUrl: null, serviceRate: 0.1, vatRate: 0.13, pricesIncludeTaxes: false, sinpe: null, methods: ["card", "apple_pay", "google_pay", "sinpe"] },
    bill: {
      id: "b1", mode: "items", mySinpe: null, lines,
      totals: { itemsSum: 17200, subtotal: 17200, service: 1720, vat: 2236, total: 21156, paid: 21156 - balance, balance },
      split: o.split ?? null,
      amounts: { all: o.all ?? balance, itemsBase: o.itemsBase ?? balance },
      othersPaying: false, paidOutside: o.paidOutside ?? 0,
    },
  };
}
const pct0 = { type: "percent", value: 0 } as const;

describe("vista previa del cobro: monto libre", () => {
  const totalBill = (all: number) => {
    const s = stateWith({ balance: 30000, all, lines: [] });
    s.bill!.mode = "total";
    return s;
  };
  it("cobra el monto escrito si cabe en lo que se puede pagar", () => {
    expect(quote(totalBill(30000), "amount", [], pct0, 10000)).toMatchObject({ amount: 10000, total: 10000, blocked: null });
  });
  it("suma la propina aparte", () => {
    expect(quote(totalBill(30000), "amount", [], { type: "percent", value: 10 }, 10000)).toMatchObject({ amount: 10000, tip: 1000, total: 11000 });
  });
  it("no deja pagar más de lo disponible ni cero", () => {
    expect(quote(totalBill(20000), "amount", [], pct0, 20001).blocked).toMatch(/máximo/);
    expect(quote(totalBill(20000), "amount", [], pct0, 0).blocked).toMatch(/Escriba cuánto/);
    expect(quote(totalBill(20000), "amount", [], pct0, 10.5).blocked).toMatch(/Escriba cuánto/);
  });
  it("sin saldo libre explica por qué", () => {
    expect(quote(totalBill(0), "amount", [], pct0, 100).blocked).toMatch(/Otra persona está pagando/);
  });
});

describe("vista previa del cobro", () => {
  it("pagar todo cobra el saldo", () => {
    expect(quote(stateWith(), "all", [], pct0)).toMatchObject({ amount: 21156, tip: 0, total: 21156, blocked: null });
  });
  it("pagar todo sin saldo disponible explica por qué", () => {
    expect(quote(stateWith({ all: 0 }), "all", [], pct0).blocked).toMatch(/Otra persona está pagando/);
  });
  it("mis platos: un casado cuesta lo mismo con impuestos y no hay nota", () => {
    const q = quote(stateWith(), "items", ["a"], pct0);
    expect(q.amount).toBe(6765);
    expect(q.note).toBeNull();
  });
  it("mis platos tras un pago de ₡5 000 por otro medio: monto ajustado y nota", () => {
    const q = quote(stateWith({ balance: 16156, paidOutside: 5000 }), "items", ["a"], pct0);
    expect(q.amount).toBe(5166);
    expect(q.note).toBe(`Ya se pagaron ${formatCRC(5000)} por otro medio; su parte se ajustó.`);
  });
  it("si elige todo lo que queda cobra el saldo exacto", () => {
    const q = quote(stateWith({ balance: 16156, paidOutside: 5000 }), "items", ["a", "b", "c"], pct0);
    expect(q.amount).toBe(16156);
  });
  it("sin platos elegidos no se puede pagar", () => {
    expect(quote(stateWith(), "items", [], pct0).blocked).toMatch(/al menos un plato/);
  });
  it("partes iguales: sin división pide las personas; con división cobra lo que toca", () => {
    expect(quote(stateWith(), "equal", [], pct0).blocked).toMatch(/cuántas personas/);
    const split = { parts: 5, share: 4231, paidParts: 0, remaining: 5, due: 4231 };
    expect(quote(stateWith({ split }), "equal", [], pct0).amount).toBe(4231);
    expect(quote(stateWith({ split: { ...split, remaining: 0, paidParts: 5 } }), "equal", [], pct0).blocked).toMatch(/todas las partes/);
  });
  it("con partes iguales activas no se eligen platos", () => {
    const split = { parts: 2, share: 10578, paidParts: 0, remaining: 2, due: 10578 };
    expect(quote(stateWith({ split }), "items", ["a"], pct0).blocked).toMatch(/partes iguales/);
  });
  it("suma la propina al total sin tocar el monto", () => {
    const q = quote(stateWith(), "items", ["a"], { type: "percent", value: 10 });
    expect(q).toMatchObject({ amount: 6765, tip: 677, total: 7442 });
  });
});

describe("propina", () => {
  it("porcentaje con empate hacia arriba y monto libre", () => {
    expect(tipFor(6765, { type: "percent", value: 10 })).toBe(677);
    expect(tipFor(6765, { type: "percent", value: 5 })).toBe(338);
    expect(tipFor(6765, { type: "amount", value: 1500 })).toBe(1500);
    expect(tipFor(0, { type: "percent", value: 10 })).toBe(0);
  });
});

describe("ayudas de la pantalla", () => {
  it("platos elegibles y reserva más próxima", () => {
    const bill = stateWith({
      lines: [line("a", 100), line("b", 100, { status: "paid" }), line("c", 100, { reserved: "other" }),
        line("d", 100, { reserved: "me", reservedUntil: "2026-10-09T12:02:00Z" }), line("e", 100, { reserved: "me", reservedUntil: "2026-10-09T12:01:00Z" })],
    }).bill!;
    expect(selectableLines(bill).map((l) => l.id)).toEqual(["a", "d", "e"]);
    expect(earliestReservation(bill)).toBe("2026-10-09T12:01:00Z");
    expect(approxShare(10001, 3)).toBe(3333);
  });
});

describe("estado crudo de la base", () => {
  const restaurant = { name: "Demo", primary_color: "#0f766e", service_rate: "0.100", vat_rate: "0.130", prices_include_taxes: false };
  it("traduce a camelCase", () => {
    const s = toClientState({
      view: "open", table_number: 4, server_time: "t", restaurant,
      bill: {
        id: "b", status: "open",
        lines: [{ id: "l", name: "Imperial", amount: 2500, status: "pending", reserved: "me", reserved_until: "u", split_group_id: null }],
        totals: { items_sum: 2500, subtotal: 2500, service: 250, vat: 325, total: 3075, paid: 0, balance: 3075 },
        split: { parts: 3, share: 1025, paid_parts: 1, remaining: 2, due: 1025 },
        amounts: { all: 3075, items_base: 3075 }, others_paying: true, paid_outside: 100,
      },
    });
    expect(s.restaurant.serviceRate).toBe(0.1);
    expect(s.bill).toMatchObject({
      id: "b", othersPaying: true, paidOutside: 100, amounts: { all: 3075, itemsBase: 3075 },
      split: { paidParts: 1, remaining: 2, due: 1025 },
      lines: [{ id: "l", reserved: "me", reservedUntil: "u" }],
    });
  });
  it("sin cuenta y cuenta terminada no traen detalle", () => {
    expect(toClientState({ view: "no_bill", table_number: 1, server_time: "t", restaurant, bill: null })).toMatchObject({ view: "no_bill", bill: null, billId: null });
    const done = toClientState({ view: "finished", table_number: 1, server_time: "t", restaurant, bill: { id: "x", status: "paid" } });
    expect(done).toMatchObject({ view: "finished", bill: null, billId: "x" });
  });
});

describe("errores del cliente", () => {
  it("usa usted y no deja pasar mensajes técnicos", () => {
    expect(mapClientError("others_paying").message).toMatch(/Espere/);
    const e = mapClientError("duplicate key value violates unique constraint");
    expect(e.status).toBe(500);
    expect(e.message).not.toMatch(/duplicate/);
  });
});

describe("proveedor mock", () => {
  const secret = "s".repeat(32);
  const provider = createMockProvider(secret);
  const hook = (body: string, sig: string) => new Request("http://x/api/webhooks/mock", { method: "POST", body, headers: { [MOCK_SIGNATURE_HEADER]: sig } });

  it("manda al checkout simulado del pago", async () => {
    const c = await provider.createCheckout({ paymentId: "p1", amount: 1000, currency: "CRC", description: "x", returnUrl: "https://a.b/m/t" });
    expect(c).toEqual({ redirectUrl: "/checkout-demo/p1", providerRef: "mock_p1" });
  });
  it("acepta un webhook con firma válida", async () => {
    const body = JSON.stringify({ providerRef: "mock_p1", status: "paid" });
    expect(await provider.parseWebhook(hook(body, signMockBody(secret, body)))).toEqual({ providerRef: "mock_p1", status: "paid" });
  });
  it("rechaza firma inválida, ausente o cuerpo alterado", async () => {
    const body = JSON.stringify({ providerRef: "mock_p1", status: "paid" });
    await expect(provider.parseWebhook(hook(body, signMockBody("otro".repeat(8), body)))).rejects.toThrow("invalid_signature");
    await expect(provider.parseWebhook(hook(body, ""))).rejects.toThrow("invalid_signature");
    await expect(provider.parseWebhook(hook(body.replace("paid", "failed"), signMockBody(secret, body)))).rejects.toThrow("invalid_signature");
  });
  it("rechaza un cuerpo con forma inválida aunque esté firmado", async () => {
    const body = JSON.stringify({ providerRef: 5, status: "paid" });
    await expect(provider.parseWebhook(hook(body, signMockBody(secret, body)))).rejects.toThrow("invalid_body");
  });
});
