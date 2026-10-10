import { computeTotals } from "@/lib/money";

import type {
  LineGroup,
  PanelBill,
  PanelLine,
  PanelMenuItem,
  PanelPayment,
  PanelState,
  PanelTable,
  TableStatus,
} from "./types";

// Filas tal como llegan de la base de datos.
export interface RestaurantRow {
  id?: string;
  show_decline_demo?: boolean;
  name: string;
  primary_color: string;
  service_rate: number | string;
  vat_rate: number | string;
  prices_include_taxes: boolean;
}
export interface TableRow { id: string; number: number }
export interface BillRow {
  id: string;
  table_id: string;
  status: "open" | "paid" | "closed";
  paid_amount: number;
  split_mode: string | null;
  split_parts: number | null;
  split_share_amount: number | null;
  split_paid_parts: number;
  opened_at: string;
  paid_at: string | null;
}
export interface ItemRow {
  id: string;
  bill_id: string;
  name: string;
  unit_price: number;
  quantity: number;
  status: "pending" | "paid" | "void";
  reserved_until: string | null;
  created_at: string;
  split_group_id?: string | null;
}
export interface PaymentRow {
  id: string;
  bill_id: string;
  amount: number;
  tip_amount: number;
  overpaid_amount: number;
  method: PanelPayment["method"];
  source: PanelPayment["source"];
  kind: PanelPayment["kind"];
  status: "pending" | "paid" | "failed";
  paid_at: string | null;
  created_at: string;
}
export interface PaymentItemRow { payment_id: string; bill_item_id: string }
export interface MenuRow { id: string; name: string; category: string; price: number; sort_order: number }

export function tableStatus(bill: Pick<PanelBill, "status" | "totals"> | null): TableStatus {
  if (!bill) return "free";
  if (bill.status === "paid") return "paid";
  return bill.totals.paid > 0 ? "partial" : "open";
}

export function buildBill(
  bill: BillRow,
  items: ItemRow[],
  payments: PaymentRow[],
  restaurant: RestaurantRow,
  now: Date,
  paymentItems: PaymentItemRow[] = [],
): PanelBill {
  const nameById = new Map(items.map((i) => [i.id, i.name]));
  const coveredBy = (paymentId: string) => {
    const counts = new Map<string, number>();
    for (const pi of paymentItems) {
      if (pi.payment_id !== paymentId) continue;
      const name = nameById.get(pi.bill_item_id);
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count }));
  };
  const visible = items.filter((i) => i.status !== "void");
  const lines: PanelLine[] = visible
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((i) => ({
      id: i.id,
      name: i.name,
      unitPrice: i.unit_price * i.quantity,
      status: i.status as "pending" | "paid",
      reserved: i.status === "pending" && !!i.reserved_until && new Date(i.reserved_until) > now,
      splitGroupId: i.split_group_id ?? null,
    }));
  const itemsSum = lines.reduce((s, l) => s + l.unitPrice, 0);
  const t = computeTotals(itemsSum, {
    serviceRate: Number(restaurant.service_rate),
    vatRate: Number(restaurant.vat_rate),
    pricesIncludeTaxes: restaurant.prices_include_taxes,
  });
  const paid = bill.paid_amount;
  return {
    id: bill.id,
    status: bill.status === "paid" ? "paid" : "open",
    openedAt: bill.opened_at,
    paidAt: bill.paid_at,
    lines,
    totals: { itemsSum, ...t, paid, balance: Math.max(t.total - paid, 0) },
    split:
      bill.split_mode && bill.split_parts && bill.split_share_amount
        ? { parts: bill.split_parts, share: bill.split_share_amount, paidParts: bill.split_paid_parts }
        : null,
    payments: payments
      .filter((p) => p.status === "paid" && p.paid_at)
      .sort((a, b) => (b.paid_at as string).localeCompare(a.paid_at as string))
      .map((p) => ({
        id: p.id,
        amount: p.amount,
        tip: p.tip_amount,
        overpaid: p.overpaid_amount,
        method: p.method,
        source: p.source,
        kind: p.kind,
        paidAt: p.paid_at as string,
        items: p.kind === "items" ? coveredBy(p.id) : [],
      })),
  };
}

export function buildPanelState(input: {
  restaurant: RestaurantRow;
  tables: TableRow[];
  bills: BillRow[];
  items: ItemRow[];
  payments: PaymentRow[];
  paymentItems?: PaymentItemRow[];
  menu: MenuRow[];
  now: Date;
}): PanelState {
  const { restaurant, now } = input;
  const live = new Map<string, BillRow>();
  for (const b of input.bills) if (b.status !== "closed") live.set(b.table_id, b);

  const tables: PanelTable[] = input.tables
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((t) => {
      const row = live.get(t.id);
      const bill = row
        ? buildBill(
            row,
            input.items.filter((i) => i.bill_id === row.id),
            input.payments.filter((p) => p.bill_id === row.id),
            restaurant,
            now,
            input.paymentItems ?? [],
          )
        : null;
      return { id: t.id, number: t.number, status: tableStatus(bill), bill };
    });

  const menu: PanelMenuItem[] = input.menu
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((m) => ({ id: m.id, name: m.name, category: m.category, price: m.price }));

  return {
    restaurant: {
      id: restaurant.id ?? "", name: restaurant.name, primaryColor: restaurant.primary_color,
      showDeclineDemo: !!restaurant.show_decline_demo,
    },
    tables,
    menu,
    serverTime: now.toISOString(),
  };
}

/** Agrupa líneas iguales (mismo nombre, precio y estado) conservando el orden de aparición. */
export function groupLines(lines: PanelLine[]): LineGroup[] {
  const groups = new Map<string, LineGroup>();
  for (const l of lines) {
    const key = `${l.status}|${l.name}|${l.unitPrice}|${l.splitGroupId ?? ''}`;
    const g = groups.get(key);
    if (g) {
      g.ids.push(l.id);
      g.count += 1;
      if (l.reserved) g.reservedCount += 1;
    } else {
      groups.set(key, {
        key,
        name: l.name,
        unitPrice: l.unitPrice,
        status: l.status,
        ids: [l.id],
        count: 1,
        reservedCount: l.reserved ? 1 : 0,
        splitGroupId: l.splitGroupId,
      });
    }
  }
  return [...groups.values()];
}

/** Mesas que pasaron a "paid" entre dos lecturas del estado (para avisar con sonido). */
export function newlyPaidTables(prev: PanelState | null, next: PanelState): number[] {
  if (!prev) return [];
  const before = new Map(prev.tables.map((t) => [t.id, t.status]));
  return next.tables
    .filter((t) => t.status === "paid" && before.has(t.id) && before.get(t.id) !== "paid")
    .map((t) => t.number);
}

/** Pagos nuevos (por id) entre dos lecturas, de cualquier mesa. */
export function newPaymentCount(prev: PanelState | null, next: PanelState): number {
  if (!prev) return 0;
  const seen = new Set(prev.tables.flatMap((t) => t.bill?.payments.map((p) => p.id) ?? []));
  return next.tables.flatMap((t) => t.bill?.payments ?? []).filter((p) => !seen.has(p.id)).length;
}
