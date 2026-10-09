import { describe, expect, it } from "vitest";

import fixtures from "../tests/fixtures/totals.json";
import {
  amountForItems,
  balance,
  computeTotals,
  equalShareDue,
  formatCRC,
  splitEqual,
  splitItem,
  tipAmount,
} from "./money";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const plain = (s: string) => s.replace(/[\s  ]/g, " ");

describe("formatCRC", () => {
  it("formatea con símbolo ₡, separador de miles y sin decimales", () => {
    expect(plain(formatCRC(12500))).toBe("₡12 500");
    expect(plain(formatCRC(1234567))).toBe("₡1 234 567");
    expect(plain(formatCRC(0))).toBe("₡0");
  });
});

describe("computeTotals", () => {
  for (const f of fixtures) {
    it(`fixture: ${f.name}`, () => {
      const got = computeTotals(f.items_sum, {
        serviceRate: f.service_rate,
        vatRate: f.vat_rate,
        pricesIncludeTaxes: f.prices_include_taxes,
      });
      expect(got).toEqual(f.expected);
    });
  }

  it("las piezas siempre suman el total, con impuestos aparte", () => {
    for (let s = 0; s <= 3000; s += 7) {
      const t = computeTotals(s, { serviceRate: 0.1, vatRate: 0.13, pricesIncludeTaxes: false });
      expect(t.subtotal + t.service + t.vat).toBe(t.total);
      expect(t.subtotal).toBe(s);
    }
  });

  it("con impuestos incluidos el total es exactamente la suma de los precios", () => {
    for (let s = 0; s <= 3000; s += 7) {
      const t = computeTotals(s, { serviceRate: 0.1, vatRate: 0.13, pricesIncludeTaxes: true });
      expect(t.total).toBe(s);
      expect(t.subtotal + t.service + t.vat).toBe(s);
      expect(t.vat).toBeGreaterThanOrEqual(0);
    }
  });

  it("rechaza montos negativos o con decimales", () => {
    const rates = { serviceRate: 0.1, vatRate: 0.13, pricesIncludeTaxes: false };
    expect(() => computeTotals(-1, rates)).toThrow(RangeError);
    expect(() => computeTotals(10.5, rates)).toThrow(RangeError);
  });
});

describe("splitEqual y splitItem", () => {
  it("reparte en partes iguales y la última absorbe el resto", () => {
    expect(splitEqual(100, 3)).toEqual([33, 33, 34]);
    expect(splitEqual(10000, 4)).toEqual([2500, 2500, 2500, 2500]);
    expect(splitEqual(100, 1)).toEqual([100]);
  });

  it("siempre suma el monto original y la última nunca es menor que las demás", () => {
    for (const amount of [47970, 9500, 12345, 1001]) {
      for (let n = 1; n <= 12; n++) {
        const parts = splitEqual(amount, n);
        expect(parts).toHaveLength(n);
        expect(sum(parts)).toBe(amount);
        expect(parts[n - 1]).toBeGreaterThanOrEqual(parts[0]);
      }
    }
  });

  it("splitItem divide un plato igual que splitEqual", () => {
    expect(splitItem(9500, 3)).toEqual([3166, 3166, 3168]);
    expect(sum(splitItem(9500, 3))).toBe(9500);
  });

  it("rechaza n inválido, montos negativos o más personas que colones", () => {
    expect(() => splitEqual(100, 0)).toThrow(RangeError);
    expect(() => splitEqual(100, 1.5)).toThrow(RangeError);
    expect(() => splitEqual(100, -2)).toThrow(RangeError);
    expect(() => splitEqual(-100, 2)).toThrow(RangeError);
    expect(() => splitEqual(5, 6)).toThrow(RangeError);
  });
});

describe("equalShareDue", () => {
  it("cobra la cuota fija mientras queden varias partes", () => {
    expect(equalShareDue({ balance: 10000, partsRemaining: 3, shareAmount: 3333 })).toBe(3333);
  });

  it("la última parte paga todo el saldo que quede", () => {
    expect(equalShareDue({ balance: 3334, partsRemaining: 1, shareAmount: 3333 })).toBe(3334);
  });

  it("nunca cobra más que el saldo", () => {
    expect(equalShareDue({ balance: 2000, partsRemaining: 2, shareAmount: 3333 })).toBe(2000);
  });

  it("rechaza cuando no quedan partes", () => {
    expect(() => equalShareDue({ balance: 100, partsRemaining: 0, shareAmount: 50 })).toThrow(RangeError);
  });
});

describe("tipAmount", () => {
  it("calcula porcentajes con redondeo hacia arriba en el empate", () => {
    expect(tipAmount(20000, { type: "percent", value: 5 })).toBe(1000);
    expect(tipAmount(12345, { type: "percent", value: 10 })).toBe(1235);
    expect(tipAmount(12345, { type: "percent", value: 0 })).toBe(0);
  });

  it("acepta un monto libre en colones enteros", () => {
    expect(tipAmount(20000, { type: "amount", value: 700 })).toBe(700);
  });

  it("rechaza propinas negativas o con decimales", () => {
    expect(() => tipAmount(1000, { type: "amount", value: -1 })).toThrow(RangeError);
    expect(() => tipAmount(1000, { type: "amount", value: 10.5 })).toThrow(RangeError);
    expect(() => tipAmount(1000, { type: "percent", value: -5 })).toThrow(RangeError);
  });
});

describe("balance", () => {
  it("resta lo pagado del total y no baja de cero", () => {
    expect(balance(47970, 5000)).toBe(42970);
    expect(balance(47970, 47970)).toBe(0);
    expect(balance(100, 150)).toBe(0);
  });
});

describe("amountForItems", () => {
  const A = { id: "a", amount: 1000 };
  const B = { id: "b", amount: 2000 };
  const C = { id: "c", amount: 3000 };

  it("cobra la parte proporcional del saldo para las líneas elegidas", () => {
    expect(amountForItems([A], [A, B, C], 7230)).toBe(1205);
    expect(amountForItems([B, C], [A, B, C], 7230)).toBe(6025);
  });

  it("si elige todas las líneas que quedan, cobra el saldo exacto", () => {
    expect(amountForItems([A, B, C], [A, B, C], 7231)).toBe(7231);
    expect(amountForItems([B, C], [B, C], 6025)).toBe(6025);
  });

  it("pagando por líneas una a una se cobra el total sin perder ni un colón", () => {
    const first = amountForItems([A], [A, B, C], 7230);
    const second = amountForItems([B], [B, C], 7230 - first);
    const third = amountForItems([C], [C], 7230 - first - second);
    expect([first, second, third]).toEqual([1205, 2410, 3615]);
    expect(first + second + third).toBe(7230);
  });

  it("después de un pago por monto reparte solo lo que queda", () => {
    expect(amountForItems([A], [A, B, C], 2230)).toBe(372);
    expect(amountForItems([A, B, C], [A, B, C], 2230)).toBe(2230);
  });

  it("nunca cobra más que el saldo", () => {
    for (const bal of [1, 10, 999, 6000, 7230]) {
      expect(amountForItems([A, B], [A, B, C], bal)).toBeLessThanOrEqual(bal);
    }
  });

  it("rechaza selección vacía, líneas que no están pendientes o repetidas", () => {
    expect(() => amountForItems([], [A, B], 3000)).toThrow(RangeError);
    expect(() => amountForItems([{ id: "x", amount: 5 }], [A, B], 3000)).toThrow(RangeError);
    expect(() => amountForItems([A, A], [A, B], 3000)).toThrow(RangeError);
  });
});
