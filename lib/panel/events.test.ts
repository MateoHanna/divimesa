import { describe, expect, it } from "vitest";

import { panelEvents } from "./events";
import type { PanelPayment, PanelState, PanelTable, TableStatus } from "./types";

const pay = (id: string, amount: number, paidAt: string, o: Partial<PanelPayment> = {}): PanelPayment =>
  ({ id, amount, tip: 0, overpaid: 0, method: "card", source: "qr", kind: "items", paidAt, items: [], ...o });

function table(number: number, status: TableStatus, payments: PanelPayment[] = []): PanelTable {
  return {
    id: `t${number}`, number, status,
    bill: status === "free" ? null : {
      id: `b${number}`, status: status === "paid" ? "paid" : "open", openedAt: "", paidAt: null, lines: [], split: null, payments,
      totals: { itemsSum: 0, subtotal: 0, service: 0, vat: 0, total: 1000, paid: 0, balance: 0 },
    },
  } as PanelTable;
}
const state = (...tables: PanelTable[]): PanelState =>
  ({ restaurant: { id: "r", name: "R", primaryColor: "#000000", logoUrl: null, showDeclineDemo: false }, tables, menu: [], serverTime: "" });

describe("panelEvents", () => {
  it("la primera lectura no genera eventos", () => {
    expect(panelEvents(null, state(table(1, "partial", [pay("p1", 500, "2026-01-01T00:00:00Z")])))).toEqual({ payments: [], paidWithoutPayment: [] });
  });

  it("un pago nuevo trae mesa, monto, propina y método", () => {
    const prev = state(table(2, "open"));
    const next = state(table(2, "partial", [pay("p1", 5000, "2026-01-01T00:00:01Z", { tip: 250, method: "sinpe" })]));
    const e = panelEvents(prev, next);
    expect(e.payments).toEqual([{ paymentId: "p1", tableId: "t2", tableNumber: 2, billId: "b2", amount: 5000, tip: 250, method: "sinpe", source: "qr", completed: false }]);
    expect(e.paidWithoutPayment).toEqual([]);
  });

  it("no repite pagos que ya estaban", () => {
    const p = pay("p1", 5000, "2026-01-01T00:00:01Z");
    expect(panelEvents(state(table(2, "partial", [p])), state(table(2, "partial", [p]))).payments).toEqual([]);
  });

  it("el pago que deja la mesa pagada lleva completed", () => {
    const p1 = pay("p1", 5000, "2026-01-01T00:00:01Z");
    const p2 = pay("p2", 3000, "2026-01-01T00:00:09Z", { method: "google_pay" });
    const e = panelEvents(state(table(3, "partial", [p1])), state(table(3, "paid", [p1, p2])));
    expect(e.payments.map((x) => [x.paymentId, x.completed])).toEqual([["p2", true]]);
  });

  it("con varios pagos a la vez, solo el último queda como completed y van en orden", () => {
    const a = pay("a", 100, "2026-01-01T00:00:02Z");
    const b = pay("b", 200, "2026-01-01T00:00:01Z");
    const e = panelEvents(state(table(4, "open")), state(table(4, "paid", [a, b])));
    expect(e.payments.map((x) => [x.paymentId, x.completed])).toEqual([["b", false], ["a", true]]);
  });

  it("una mesa que queda pagada sin pago nuevo se informa aparte", () => {
    const p = pay("p1", 100, "2026-01-01T00:00:01Z");
    const e = panelEvents(state(table(5, "partial", [p])), state(table(5, "paid", [p])));
    expect(e.payments).toEqual([]);
    expect(e.paidWithoutPayment).toEqual([{ tableId: "t5", tableNumber: 5, billId: "b5" }]);
  });

  it("una mesa que ya estaba pagada no vuelve a avisar", () => {
    const p = pay("p1", 100, "2026-01-01T00:00:01Z");
    expect(panelEvents(state(table(6, "paid", [p])), state(table(6, "paid", [p]))).paidWithoutPayment).toEqual([]);
  });
});
