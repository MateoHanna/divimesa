import { describe, expect, it } from "vitest";

import items from "../../tests/fixtures/items-amount.json";
import { amountForItems } from "../money";
import { parseSession, pinMatches, signSession, verifySession } from "./auth";
import { mapDbError } from "./errors";
import { createLimiter } from "./rate-limit";
import { normalizeSinpeHolder, normalizeSinpeNumber } from "./sinpe";
import { formatSinpeNumber } from "../sinpe";
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

const SECRET = "s".repeat(40);
const RID = "7df64a22-ee3f-42cf-91fa-657ae61778b3";
const OTHER = "11111111-2222-4333-8444-555555555555";
const T0 = 1_000_000_000_000;

describe("sesión del panel", () => {
  it("acepta un token recién firmado, del restaurante que dice la cookie", () => {
    const t = signSession(RID, "hash:a", SECRET, T0);
    expect(verifySession(t, "hash:a", SECRET, T0 + 1000)).toBe(true);
    expect(parseSession(t)?.restaurantId).toBe(RID);
  });
  it("rechaza un token vencido", () => {
    const t = signSession(RID, "hash:a", SECRET, T0, 1000);
    expect(verifySession(t, "hash:a", SECRET, T0 + 1000)).toBe(false);
  });
  it("cambiar el PIN (el binding) invalida la sesión", () => {
    const t = signSession(RID, "hash:a", SECRET, T0);
    expect(verifySession(t, "hash:b", SECRET, T0 + 500)).toBe(false);
  });
  it("cambiar el secreto invalida la sesión", () => {
    const t = signSession(RID, "hash:a", SECRET, T0);
    expect(verifySession(t, "hash:a", "x".repeat(40), T0 + 500)).toBe(false);
  });
  it("no se puede cambiar el restaurante de la cookie por otro", () => {
    const t = signSession(RID, "hash:a", SECRET, T0);
    const swapped = t.replace(RID, OTHER);
    expect(parseSession(swapped)?.restaurantId).toBe(OTHER);
    expect(verifySession(swapped, "hash:a", SECRET, T0 + 500)).toBe(false);
  });
  it("rechaza tokens alterados o malformados", () => {
    const t = signSession(RID, "hash:a", SECRET, T0);
    const [rid, exp, sig] = t.split(".");
    expect(verifySession(`${rid}.${Number(exp) + 99999}.${sig}`, "hash:a", SECRET, T0 + 500)).toBe(false);
    for (const bad of ["", "abc", ".", "123.", "9999999999999.%%%", `${RID}.1.x`, `${RID}.${T0}.`, `${t}.extra`, undefined, null]) {
      expect(verifySession(bad as string, "hash:a", SECRET, T0 + 500)).toBe(false);
    }
  });
  it("las sesiones del formato anterior (sin restaurante) ya no valen", () => {
    expect(parseSession(`${T0}.abcdef`)).toBeNull();
  });
  it("compara el PIN de la demo", () => {
    expect(pinMatches("4821", "4821", SECRET)).toBe(true);
    expect(pinMatches("4822", "4821", SECRET)).toBe(false);
    expect(pinMatches("", "4821", SECRET)).toBe(false);
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

describe("cuenta de solo el total (modo piloto)", () => {
  const total = (o: Partial<BillRow> = {}) => bill({ fixed_total: 25000, ...o });
  const build = (b: BillRow, payments: PaymentRow[], invoices = [] as Parameters<typeof buildPanelState>[0]["invoices"]) =>
    buildPanelState({ restaurant: { ...restaurant, bill_mode: "total", sinpe_number: "88887777", sinpe_holder: "Soda Piloto" }, tables: [{ id: "t1", number: 1 }],
      bills: [b], items: [], payments, invoices, menu: [], now: NOW });

  it("el total digitado es el total: no suma servicio ni IVA", () => {
    const s = build(total({ paid_amount: 10000 }), []);
    expect(s.tables[0].bill).toMatchObject({ mode: "total", totals: { itemsSum: 25000, subtotal: 25000, service: 0, vat: 0, total: 25000, paid: 10000, balance: 15000 } });
    expect(s.restaurant).toMatchObject({ billMode: "total", sinpeNumber: "88887777", sinpeHolder: "Soda Piloto", isDemo: false });
  });

  it("una cuenta por platos sigue calculando servicio e IVA", () => {
    expect(buildPanelState({ restaurant, tables: [{ id: "t1", number: 1 }], bills: [bill()], items: [item("i1")], payments: [], menu: [], now: NOW })
      .tables[0].bill).toMatchObject({ mode: "items", totals: { service: 550, vat: 715, total: 6765 } });
  });

  it("solo los SINPE reportados y sin responder aparecen por confirmar, con su factura", () => {
    const sinpe = (o: Partial<PaymentRow>): PaymentRow => pay({ method: "sinpe", source: "qr", status: "pending", paid_at: null, created_at: "2026-10-09T11:55:00Z", ...o });
    const s = build(total(), [
      sinpe({ id: "a", reported_at: "2026-10-09T11:56:00Z", reference_code: "M1-7K2", payer_name: "Ana Mora", amount: 10000, tip_amount: 1000 }),
      sinpe({ id: "b", reported_at: null }), // solo vio las instrucciones
      sinpe({ id: "c", reported_at: "2026-10-09T11:57:00Z", status: "failed" }),
    ], [{ payment_id: "a", name: "Ana Mora", id_type: "fisica", id_number: "112340567", email: "ana@example.com" }]);
    expect(s.tables[0].bill!.pending).toEqual([{
      id: "a", amount: 10000, tip: 1000, kind: "amount", code: "M1-7K2", payerName: "Ana Mora", reportedAt: "2026-10-09T11:56:00Z",
      invoice: { name: "Ana Mora", idType: "fisica", idNumber: "112340567", email: "ana@example.com" },
    }]);
    expect(s.tables[0].bill!.payments).toEqual([]); // todavía no es un pago confirmado
  });

  it("platos apartados por un SINPE por confirmar ('infinity') cuentan como apartados", () => {
    const s = buildPanelState({ restaurant, tables: [{ id: "t1", number: 1 }], bills: [bill()], items: [item("i1", { reserved_until: "infinity" })], payments: [], menu: [], now: NOW });
    expect(s.tables[0].bill!.lines[0].reserved).toBe(true);
  });

  it("un SINPE confirmado queda en los pagos con su código y nombre", () => {
    const s = build(total({ paid_amount: 25000, status: "paid", paid_at: "2026-10-09T11:58:00Z" }), [
      pay({ id: "a", method: "sinpe", source: "qr", kind: "full", amount: 25000, reference_code: "M1-AB3", payer_name: "Luis" }),
    ]);
    expect(s.tables[0].bill!.payments[0]).toMatchObject({ code: "M1-AB3", payerName: "Luis", method: "sinpe" });
    expect(s.tables[0].bill!.pending).toEqual([]);
  });
});

describe("datos del SINPE Móvil", () => {
  it("acepta 8 dígitos con espacios o guion", () => {
    expect(normalizeSinpeNumber("8888-7777")).toBe("88887777");
    expect(normalizeSinpeNumber(" 8888 7777 ")).toBe("88887777");
    expect(normalizeSinpeNumber("")).toBeNull();
  });
  it("rechaza números que no son de 8 dígitos", () => {
    for (const bad of ["8888777", "888877778", "8888-77a7", "+506 8888 7777"]) expect(() => normalizeSinpeNumber(bad)).toThrow();
  });
  it("normaliza el nombre del titular", () => {
    expect(normalizeSinpeHolder("  Soda   La Esquina  S.A. ")).toBe("Soda La Esquina S.A.");
    expect(normalizeSinpeHolder("  ")).toBeNull();
    expect(() => normalizeSinpeHolder("A")).toThrow();
    expect(() => normalizeSinpeHolder("x".repeat(81))).toThrow();
  });
  it("da formato 8888-7777 solo a números válidos", () => {
    expect(formatSinpeNumber("88887777")).toBe("8888-7777");
    expect(formatSinpeNumber("123")).toBe("123");
  });
});

describe("agrupar líneas", () => {
  const l = (id: string, o: Partial<PanelLine> = {}): PanelLine => ({ id, name: "Casado", unitPrice: 5500, status: "pending", reserved: false, splitGroupId: null, ...o });
  it("junta iguales y separa por estado o precio", () => {
    const g = groupLines([l("a"), l("b", { reserved: true }), l("c", { status: "paid" }), l("d", { unitPrice: 4000 })]);
    expect(g.map((x) => [x.count, x.status, x.unitPrice, x.reservedCount])).toEqual([
      [2, "pending", 5500, 1], [1, "paid", 5500, 0], [1, "pending", 4000, 0],
    ]);
    expect(g[0].ids).toEqual(["a", "b"]);
  });

  it("no junta partes de un plato dividido con platos sueltos y conserva el id del grupo", () => {
    const g = groupLines([l("a", { name: "Nachos (1/2)", unitPrice: 2000, splitGroupId: "g1" }), l("b", { name: "Nachos (1/2)", unitPrice: 2000 })]);
    expect(g).toHaveLength(2);
    expect(g[0].splitGroupId).toBe("g1");
    expect(g[1].splitGroupId).toBeNull();
  });
});
