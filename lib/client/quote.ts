import { amountForItems, computeTotals, formatCRC, tipAmount } from "@/lib/money";

import type { ClientBill, ClientState, PayMode, TipChoice } from "./types";

export interface Quote {
  /** Monto que baja el saldo. */
  amount: number;
  tip: number;
  /** Monto + propina. */
  total: number;
  /** Línea que explica por qué el monto difiere de la suma de los platos. */
  note: string | null;
  /** Por qué no se puede pagar todavía (null si se puede). */
  blocked: string | null;
}

const EMPTY: Quote = { amount: 0, tip: 0, total: 0, note: null, blocked: null };

export function tipFor(amount: number, tip: TipChoice): number {
  if (amount <= 0) return 0;
  return tip.type === "percent" ? tipAmount(amount, { type: "percent", value: tip.value }) : tipAmount(amount, { type: "amount", value: Math.max(0, Math.round(tip.value)) });
}

/** Líneas pendientes que esta sesión puede elegir (no apartadas por otra persona). */
export function selectableLines(bill: ClientBill) {
  return bill.lines.filter((l) => l.status === "pending" && l.reserved !== "other");
}

/**
 * Vista previa del cobro. El servidor vuelve a calcular todo al crear el pago y manda su monto:
 * esto solo sirve para mostrarlo antes de tocar "Pagar".
 */
export function quote(
  state: ClientState, mode: PayMode | null, selectedIds: readonly string[], tip: TipChoice, freeAmount = 0,
): Quote {
  const bill = state.bill;
  if (!bill || !mode) return EMPTY;

  let amount = 0;
  let note: string | null = null;
  let blocked: string | null = null;

  if (mode === "all") {
    amount = bill.amounts.all;
    if (amount <= 0) blocked = bill.totals.balance > 0 ? "Otra persona está pagando el resto de la cuenta. Espere un momento." : "No hay saldo pendiente.";
  } else if (mode === "amount") {
    // Monto libre (solo cuentas de solo el total): entero, de 1 hasta lo que se puede pagar ahora.
    if (bill.amounts.all <= 0) {
      blocked = bill.totals.balance > 0 ? "Otra persona está pagando el resto de la cuenta. Espere un momento." : "No hay saldo pendiente.";
    } else if (bill.split) {
      blocked = "La cuenta está en partes iguales. Pague una parte.";
    } else if (!Number.isInteger(freeAmount) || freeAmount < 1) {
      blocked = "Escriba cuánto va a pagar.";
    } else if (freeAmount > bill.amounts.all) {
      blocked = `Lo máximo que puede pagar ahora es ${formatCRC(bill.amounts.all)}.`;
    } else {
      amount = freeAmount;
    }
  } else if (mode === "equal") {
    if (!bill.split) {
      blocked = "Elija entre cuántas personas se divide la cuenta.";
    } else if (bill.split.remaining <= 0) {
      blocked = bill.split.paidParts >= bill.split.parts ? "Ya se pagaron todas las partes." : "Las partes que faltan ya están en pago.";
    } else {
      amount = bill.split.due;
      if (amount <= 0) blocked = "Otra persona está pagando el resto de la cuenta. Espere un momento.";
    }
  } else {
    if (bill.split) {
      blocked = "La cuenta está en partes iguales. Los platos no se pueden elegir.";
    } else if (selectedIds.length === 0) {
      blocked = "Elija al menos un plato.";
    } else {
      const pending = bill.lines.filter((l) => l.status === "pending").map((l) => ({ id: l.id, amount: l.amount }));
      const selected = pending.filter((l) => selectedIds.includes(l.id));
      if (selected.length === 0) {
        blocked = "Elija al menos un plato.";
      } else {
        amount = amountForItems(selected, pending, bill.amounts.itemsBase);
        const selectedSum = selected.reduce((s, l) => s + l.amount, 0);
        const nominal = computeTotals(selectedSum, state.restaurant).total;
        if (amount !== nominal) {
          note = bill.paidOutside > 0
            ? `Ya se pagaron ${formatCRC(bill.paidOutside)} por otro medio; su parte se ajustó.`
            : "Ya hubo otros pagos en la cuenta; su parte se ajustó.";
        }
        if (amount <= 0) blocked = "Otra persona está pagando el resto de la cuenta. Espere un momento.";
      }
    }
  }

  const t = tipFor(amount, tip);
  return { amount, tip: t, total: amount + t, note, blocked };
}

/** Cuota aproximada por persona para mostrar antes de fijar las partes iguales. */
export function approxShare(balance: number, parts: number): number {
  return parts > 0 ? Math.floor(balance / parts) : 0;
}

/** Instante en que vence la reserva más próxima de esta sesión (ISO) o null. */
export function earliestReservation(bill: ClientBill): string | null {
  const times = bill.lines.filter((l) => l.reserved === "me" && l.reservedUntil).map((l) => l.reservedUntil as string);
  return times.length ? times.sort()[0] : null;
}
