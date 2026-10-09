import { describe, expect, it } from "vitest";

import items from "../../tests/fixtures/items-amount.json";
import { amountForItems } from "../money";
import { pinMatches, signSession, verifySession } from "./auth";
import { mapDbError } from "./errors";
import { createLimiter } from "./rate-limit";
import {
  buildPanelState,
  groupLines,
  newlyPaidTables,
  newPaymentCount,
  tableStatus,
  type BillRow,
  type ItemRow,
  type PaymentRow,
} from "./state";
import type { PanelLine } from "./types";

const keys = { pin: "4821", secret: "s".repeat(40) };

describe("sesión del panel", () => {
  it("acepta un token recién firmado", () => {
    const t = signSession(keys, 1_000_000_000_000);
    expect(verifySession(t, keys, 1_000_000_000_000 + 1000)).toBe(true);
  });
  it("rechaza un token vencido", () => {
    const t = signSession(keys, 1_000_000_000_000, 1000);
    expect(verifySession(t, keys, 1_000_000_000_000 + 1000)).toBe(false);
  });
  it("cambiar el PIN invalida la sesión", () => {
    const t = signSession(keys, 1_000_000_000_000);
    expect(verifySession(t, { ...keys, pin: "9999" }, 1_000_000_000_500)).toBe(false);
  });
  it("cambiar el secreto invalida la sesión", () => {
    const t = signSession(keys, 1_000_000_000_000);
    expect(verifySession(t, { ...keys, secret: "x".repeat(40) }, 1_000_000_000_500)).toBe(false);
  });
  it("rechaza tokens alterados o malformados", () => {
    const t = signSession(keys, 1_000_000_000_000);
    const [exp, sig] = t.split(".");
    expect(verifySession(`${Number(exp) + 99999}.${sig}`, keys, 1_000_000_000_500)).toBe(false);
    for (const bad of ["", "abc", ".", "123.", "9999999999999.%%%", undefined, null]) {
      expect(verifySession(bad as string, keys, 1_000_000_000_500)).toBe(false);
    }
  });
  it("compara el PIN", () => {
    expect(pinMatches("4821", "4821", keys.secret)).toBe(true);
    expect(pinMatches("4822", "4821", keys.secret)).toBe(false);
    expect(pinMatches("", "4821", keys.secret)).toBe(false);
  });
});

describe("limitador de intentos", () => {
  it("bloquea tras el máximo y libera al pasar la ventana", () => {
    let now = 0;
    const l = createLimiter({ max: 3, windowMs: 60_000, now: () => now });
    for (let i = 0; i < 3; i++) {
      expect(l.check("ip").allowed).toBe(true);
      l.fail("ip");
    }
    const blocked = l.check("ip");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBe(60);
    expect(l.check("otra").allowed).toBe(true);
    now = 60_000;
    expect(l.check("ip").allowed).toBe(true);
  });
  it("reset borra los fallos", () => {
    const l = createLimiter({ max: 1, windowMs: 1000, now: () => 0 });
    l.fail("a");
    expect(l.check("a").allowed).toBe(false);
    l.reset("a");
    expect(l.check("a").allowed).toBe(true);
  });
});

describe("errores", () => {
  it("traduce códigos conocidos", () => {
    expect(mapDbError("amount_exceeds_balance").status).toBe(409);
    expect(mapDbError("table_has_bill").message).toMatch(/ya tiene una cuenta/);
  });
  it("no deja pasar mensajes desconocidos", () => {
    const e = mapDbError('relation "x" does not exist');
    expect(e.status).toBe(500);
    expect(e.message).not.toMatch(/relation/);
  });
});

describe("monto por platos: casos compartidos con SQL", () => {
  for (const c of items) {
    it(c.name, () => {
      const sel = c.selected.map((amount, i) => ({ id: `s${i}`, amount }));
      // Los seleccionados son parte de los pendientes: se reconstruyen con ids estables.
      const rest = c.pending.slice(c.selected.length).map((amount, i) => ({ id: `p${i}`, amount }));
      expect(amountForItems(sel, [...sel, ...rest], c.balance)).toBe(c.expected);
    });
  }
});

const restaurant = { name: "Demo", primary_color: "#0f766e", service_rate: "0.100", vat_rate: "0.130", prices_include_taxes: false };
const NOW = new Date("2026-10-09T12:00:00Z");
const bill = (o: Partial<BillRow> = {}): BillRow => ({
  id: "b1", table_id: "t1", status: "open", paid_amount: 0, split_mode: null, split_parts: null,
  split_share_amount: null, split_paid_parts: 0, opened_at: "2026-10-09T11:00:00Z", paid_at: null, ...o,
});
const item = (id: string, o: Partial<ItemRow> = {}): ItemRow => ({
  id, bill_id: "b1", name: "Casado de pollo", unit_price: 5500, quantity: 1, status: "pending",
  reserved_until: null, created_at: `2026-10-09T11:00:0${id.slice(-1)}Z`, ...o,
});
const pay = (o: Partial<PaymentRow> = {}): PaymentRow => ({
  id: "p1", bill_id: "b1", amount: 5000, tip_amount: 0, overpaid_amount: 0, method: "cash", source: "panel",
  kind: "amount", status: "paid", paid_at: "2026-10-09T11:30:00Z", created_at: "2026-10-09T11:30:00Z", ...o,
});

describe("estado del panel", () => {
  const tables = [{ id: "t2", number: 2 }, { id: "t1", number: 1 }, { id: "t3", number: 3 }];
  const base = {
    restaurant, tables, menu: [], now: NOW,
    bills: [bill({ paid_amount: 5000 }), bill({ id: "b2", table_id: "t2", status: "paid", paid_amount: 6765, paid_at: "2026-10-09T11:40:00Z" }),
            bill({ id: "b0", table_id: "t3", status: "closed" })],
    items: [item("i1"), item("i2", { name: "Imperial", unit_price: 2500 }), item("i3", { status: "void" }),
            item("i4", { bill_id: "b2", status: "paid" })],
    payments: [pay(), pay({ id: "p2", status: "pending" }), pay({ id: "p3", status: "failed" })],
  };

  it("ordena mesas, ignora cuentas cerradas y calcula totales", () => {
    const s = buildPanelState(base);
    expect(s.tables.map((t) => t.number)).toEqual([1, 2, 3]);
    expect(s.tables.map((t) => t.status)).toEqual(["partial", "paid", "free"]);
    const t1 = s.tables[0].bill!;
    expect(t1.lines).toHaveLength(2); // la anulada no aparece
    expect(t1.totals).toMatchObject({ itemsSum: 8000, subtotal: 8000, service: 800, vat: 1040, total: 9840, paid: 5000, balance: 4840 });
    expect(t1.payments.map((p) => p.id)).toEqual(["p1"]); // solo los pagados
  });

  it("estado de mesa", () => {
    const totals = { itemsSum: 0, subtotal: 0, service: 0, vat: 0, total: 0, paid: 0, balance: 0 };
    expect(tableStatus(null)).toBe("free");
    expect(tableStatus({ status: "open", totals })).toBe("open");
    expect(tableStatus({ status: "open", totals: { ...totals, paid: 1 } })).toBe("partial");
    expect(tableStatus({ status: "paid", totals })).toBe("paid");
  });

  it("reservas vencidas cuentan como libres", () => {
    const s = buildPanelState({
      ...base,
      items: [item("i1", { reserved_until: "2026-10-09T12:01:00Z" }), item("i2", { reserved_until: "2026-10-09T11:59:00Z" })],
    });
    expect(s.tables[0].bill!.lines.map((l) => l.reserved)).toEqual([true, false]);
  });

  it("muestra qué platos cubrió un pago por platos", () => {
    const s = buildPanelState({
      ...base,
      payments: [pay({ id: "pi", kind: "items", amount: 6765 }), pay({ id: "pa", kind: "amount" })],
      paymentItems: [
        { payment_id: "pi", bill_item_id: "i1" },
        { payment_id: "pi", bill_item_id: "i2" },
        { payment_id: "pa", bill_item_id: "i1" }, // un pago por monto nunca lista platos
      ],
    });
    const byId = Object.fromEntries(s.tables[0].bill!.payments.map((p) => [p.id, p.items]));
    expect(byId.pi).toEqual([{ name: "Casado de pollo", count: 1 }, { name: "Imperial", count: 1 }]);
    expect(byId.pa).toEqual([]);
  });

  it("agrupa platos repetidos de un pago", () => {
    const s = buildPanelState({
      ...base,
      items: [item("i1"), item("i2"), item("i3", { name: "Imperial", unit_price: 2500 })],
      payments: [pay({ id: "pi", kind: "items" })],
      paymentItems: ["i1", "i2", "i3"].map((id) => ({ payment_id: "pi", bill_item_id: id })),
    });
    expect(s.tables[0].bill!.payments[0].items).toEqual([{ name: "Casado de pollo", count: 2 }, { name: "Imperial", count: 1 }]);
  });

  it("detecta mesas que pasaron a pagadas y pagos nuevos", () => {
    const prev = buildPanelState(base);
    const next = buildPanelState({
      ...base,
      bills: [bill({ status: "paid", paid_amount: 9840 }), ...base.bills.slice(1)],
      payments: [...base.payments, pay({ id: "p9", amount: 4840, paid_at: "2026-10-09T11:50:00Z" })],
    });
    expect(newlyPaidTables(prev, next)).toEqual([1]);
    expect(newPaymentCount(prev, next)).toBe(1);
    expect(newlyPaidTables(null, next)).toEqual([]);
  });
});

describe("agrupar líneas", () => {
  const l = (id: string, o: Partial<PanelLine> = {}): PanelLine => ({ id, name: "Casado", unitPrice: 5500, status: "pending", reserved: false, ...o });
  it("junta iguales y separa por estado o precio", () => {
    const g = groupLines([l("a"), l("b", { reserved: true }), l("c", { status: "paid" }), l("d", { unitPrice: 4000 })]);
    expect(g.map((x) => [x.count, x.status, x.unitPrice, x.reservedCount])).toEqual([
      [2, "pending", 5500, 1], [1, "paid", 5500, 0], [1, "pending", 4000, 0],
    ]);
    expect(g[0].ids).toEqual(["a", "b"]);
  });
});
