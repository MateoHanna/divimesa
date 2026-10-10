import type { PanelPayment, PanelState } from "./types";

export interface PaymentEvent {
  paymentId: string;
  tableId: string;
  tableNumber: number;
  billId: string;
  amount: number;
  tip: number;
  method: PanelPayment["method"];
  source: PanelPayment["source"];
  /** Este pago dejó la mesa pagada por completo. */
  completed: boolean;
}

/** Un SINPE nuevo por confirmar. */
export interface PendingEvent {
  paymentId: string;
  tableId: string;
  tableNumber: number;
  billId: string;
  /** Lo que debe llegar al banco: monto de la cuenta + propina. */
  amount: number;
  tip: number;
  code: string | null;
  payerName: string | null;
}

export interface PanelEvents {
  /** SINPE que el cliente reportó entre las dos lecturas (todavía por confirmar). */
  pending: PendingEvent[];
  /** Un evento por pago nuevo, del más viejo al más nuevo. */
  payments: PaymentEvent[];
  /** Mesas que pasaron a "pagada" sin un pago nuevo (por ejemplo, al bajar un precio). */
  paidWithoutPayment: { tableId: string; tableNumber: number; billId: string }[];
}

/**
 * Qué cambió entre dos lecturas del panel: pagos nuevos (por id) y mesas que quedaron pagadas.
 * La primera lectura no genera eventos. Si una mesa recibe varios pagos a la vez, solo el último
 * (el que la dejó pagada) lleva `completed`.
 */
export function panelEvents(prev: PanelState | null, next: PanelState): PanelEvents {
  const none: PanelEvents = { pending: [], payments: [], paidWithoutPayment: [] };
  if (!prev) return none;
  const seen = new Set(prev.tables.flatMap((t) => t.bill?.payments.map((p) => p.id) ?? []));
  const before = new Map(prev.tables.map((t) => [t.id, t.status]));

  const seenPending = new Set(prev.tables.flatMap((t) => t.bill?.pending.map((p) => p.id) ?? []));
  const pending: PendingEvent[] = [];
  const payments: { at: string; event: PaymentEvent }[] = [];
  const paidWithoutPayment: PanelEvents["paidWithoutPayment"] = [];

  for (const t of next.tables) {
    if (!t.bill) continue;
    for (const p of t.bill.pending) {
      if (seenPending.has(p.id)) continue;
      pending.push({
        paymentId: p.id, tableId: t.id, tableNumber: t.number, billId: t.bill.id,
        amount: p.amount + p.tip, tip: p.tip, code: p.code, payerName: p.payerName,
      });
    }
    const fresh = t.bill.payments.filter((p) => !seen.has(p.id)).sort((a, b) => a.paidAt.localeCompare(b.paidAt));
    const becamePaid = t.status === "paid" && before.has(t.id) && before.get(t.id) !== "paid";
    fresh.forEach((p, i) => {
      payments.push({
        at: p.paidAt,
        event: {
          paymentId: p.id, tableId: t.id, tableNumber: t.number, billId: t.bill!.id, amount: p.amount, tip: p.tip,
          method: p.method, source: p.source, completed: becamePaid && i === fresh.length - 1,
        },
      });
    });
    if (becamePaid && fresh.length === 0) paidWithoutPayment.push({ tableId: t.id, tableNumber: t.number, billId: t.bill.id });
  }

  payments.sort((a, b) => a.at.localeCompare(b.at));
  return { pending, payments: payments.map((p) => p.event), paidWithoutPayment };
}
