/**
 * Cálculos de dinero. Todo en colones (CRC), enteros, sin decimales.
 * Funciones puras: la misma lógica se replica en SQL (calc_totals) y los dos lados
 * se comparan con tests/fixtures/totals.json.
 */

/**
 * Formato `₡12 500`, igual en cualquier navegador: no depende del locale (Safari de iPhone ponía punto).
 * Separador de miles: espacio sin salto (U+00A0). Se agrupa desde 4 cifras (`₡2 500`), como
 * lo hacía Chrome, para que no cambie nada de lo que ya se ve.
 */
export function formatCRC(amount: number): string {
  const n = Math.round(amount);
  const digits = String(Math.abs(n));
  const grouped = digits.length >= 4 ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0") : digits;
  return `${n < 0 ? "-" : ""}₡${grouped}`;
}

function assertColones(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} debe ser un entero de colones mayor o igual a 0 (recibido: ${value})`);
  }
}

/** a / b redondeado al entero más cercano, con el empate hacia arriba. Solo para a >= 0 y b > 0. */
function roundDiv(a: number, b: number): number {
  return Math.floor((2 * a + b) / (2 * b));
}

/** Tasa decimal (0.13) a milésimas enteras (130), para no depender de decimales binarios. */
function permille(rate: number): number {
  if (!Number.isFinite(rate) || rate < 0) {
    throw new RangeError(`La tasa debe ser un número mayor o igual a 0 (recibido: ${rate})`);
  }
  return Math.round(rate * 1000);
}

export interface TaxRates {
  serviceRate: number;
  vatRate: number;
  pricesIncludeTaxes: boolean;
}

export interface Totals {
  subtotal: number;
  service: number;
  vat: number;
  total: number;
}

/**
 * Desglose de una cuenta a partir de la suma de los precios de los platos.
 * - Impuestos aparte: subtotal = suma, servicio y IVA sobre el subtotal, total = todo junto.
 * - Impuestos incluidos: el total es la suma; el subtotal se saca hacia atrás y el IVA
 *   se calcula de último para que las piezas sumen exacto.
 */
export function computeTotals(itemsSum: number, rates: TaxRates): Totals {
  assertColones(itemsSum, "La suma de los platos");
  const sp = permille(rates.serviceRate);
  const vp = permille(rates.vatRate);

  if (rates.pricesIncludeTaxes) {
    const subtotal = roundDiv(itemsSum * 1000, 1000 + sp + vp);
    const service = roundDiv(subtotal * sp, 1000);
    const vat = itemsSum - subtotal - service;
    return { subtotal, service, vat, total: itemsSum };
  }

  const service = roundDiv(itemsSum * sp, 1000);
  const vat = roundDiv(itemsSum * vp, 1000);
  return { subtotal: itemsSum, service, vat, total: itemsSum + service + vat };
}

/** Saldo pendiente: total menos lo pagado, sin bajar de cero. */
export function balance(total: number, paid: number): number {
  assertColones(total, "El total");
  assertColones(paid, "Lo pagado");
  return Math.max(0, total - paid);
}

/** Parte la cantidad en n partes enteras; la última absorbe el redondeo. */
export function splitEqual(amount: number, n: number): number[] {
  assertColones(amount, "El monto");
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new RangeError(`El número de partes debe ser un entero mayor o igual a 1 (recibido: ${n})`);
  }
  if (n > amount) {
    throw new RangeError(`No se pueden repartir ₡${amount} entre ${n} partes`);
  }
  const share = Math.floor(amount / n);
  const parts = Array<number>(n).fill(share);
  parts[n - 1] = amount - share * (n - 1);
  return parts;
}

/** Dividir un plato entre n personas: mismo reparto que `splitEqual`. */
export const splitItem = splitEqual;

/**
 * Lo que debe pagar la siguiente persona en modo partes iguales.
 * La última parte paga todo el saldo que quede; ninguna cobra más que el saldo.
 */
export function equalShareDue(p: { balance: number; partsRemaining: number; shareAmount: number }): number {
  assertColones(p.balance, "El saldo");
  assertColones(p.shareAmount, "La cuota");
  if (!Number.isSafeInteger(p.partsRemaining) || p.partsRemaining < 1) {
    throw new RangeError("No quedan partes por pagar");
  }
  if (p.partsRemaining === 1) return p.balance;
  return Math.min(p.balance, p.shareAmount);
}

export type Tip = { type: "percent"; value: number } | { type: "amount"; value: number };

/** Propina extra (aparte del servicio) sobre el monto que se paga. */
export function tipAmount(base: number, tip: Tip): number {
  assertColones(base, "El monto base");
  if (tip.type === "amount") {
    assertColones(tip.value, "La propina");
    return tip.value;
  }
  if (!Number.isSafeInteger(tip.value) || tip.value < 0 || tip.value > 100) {
    throw new RangeError(`El porcentaje de propina debe ser un entero entre 0 y 100 (recibido: ${tip.value})`);
  }
  return roundDiv(base * tip.value, 100);
}

export interface BillLine {
  id: string;
  /** unit_price × quantity, en colones. */
  amount: number;
}

/**
 * Monto a cobrar por las líneas elegidas ("Pagar mis platos"): su parte proporcional del
 * saldo pendiente (platos + servicio + IVA). Si eligen todas las líneas que quedan,
 * se cobra el saldo exacto, así nunca sobra ni falta un colón por redondeo.
 */
export function amountForItems(selected: BillLine[], pending: BillLine[], balanceDue: number): number {
  assertColones(balanceDue, "El saldo");
  if (selected.length === 0) throw new RangeError("Hay que elegir al menos un plato");

  const pendingById = new Map(pending.map((l) => [l.id, l]));
  const seen = new Set<string>();
  let selectedSum = 0;
  for (const line of selected) {
    if (seen.has(line.id)) throw new RangeError(`El plato ${line.id} está repetido`);
    seen.add(line.id);
    const match = pendingById.get(line.id);
    if (!match) throw new RangeError(`El plato ${line.id} no está pendiente de pago`);
    selectedSum += match.amount;
  }

  if (seen.size === pendingById.size) return balanceDue;

  let pendingSum = 0;
  for (const l of pendingById.values()) pendingSum += l.amount;
  if (pendingSum <= 0) throw new RangeError("No hay platos pendientes con precio");

  return Math.min(balanceDue, roundDiv(balanceDue * selectedSum, pendingSum));
}
