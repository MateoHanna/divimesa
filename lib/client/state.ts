import type { ClientBill, ClientLine, ClientState, MySinpe, PayMethod } from "./types";

// Forma cruda que devuelve public.client_state (snake_case).
interface RawLine {
  id: string; name: string; amount: number; status: "pending" | "paid";
  reserved: "none" | "me" | "other"; reserved_until: string | null; split_group_id: string | null;
}
interface RawState {
  view: "no_bill" | "open" | "finished";
  table_number: number;
  server_time: string;
  restaurant: {
    name: string; primary_color: string; logo_url?: string | null;
    service_rate?: number | string; vat_rate?: number | string; prices_include_taxes?: boolean;
    sinpe?: { number: string; holder: string; test: boolean } | null;
    methods?: PayMethod[];
  };
  bill: null | {
    id: string;
    status: string;
    mode?: "items" | "total";
    my_sinpe?: null | {
      id: string; status: "pending" | "paid" | "failed"; amount: number; tip: number; code: string | null; reported: boolean;
      kind: MySinpe["kind"]; method?: "sinpe" | "terminal";
    };
    outcome?: "paid" | "closed";
    lines?: RawLine[];
    totals?: { items_sum: number; subtotal: number; service: number; vat: number; total: number; paid: number; balance: number };
    split?: null | { parts: number; share: number; paid_parts: number; remaining: number; due: number };
    amounts?: { all: number; items_base: number };
    others_paying?: boolean;
    paid_outside?: number;
  };
}

export function toClientState(raw: RawState): ClientState {
  const b = raw.bill;
  let bill: ClientBill | null = null;
  if (raw.view === "open" && b && b.lines && b.totals && b.amounts) {
    bill = {
      id: b.id,
      mode: b.mode === "total" ? "total" : "items",
      mySinpe: b.my_sinpe ? { ...b.my_sinpe, method: b.my_sinpe.method === "terminal" ? "terminal" : "sinpe" } : null,
      lines: b.lines.map<ClientLine>((l) => ({
        id: l.id, name: l.name, amount: l.amount, status: l.status, reserved: l.reserved,
        reservedUntil: l.reserved_until, splitGroupId: l.split_group_id,
      })),
      totals: {
        itemsSum: b.totals.items_sum, subtotal: b.totals.subtotal, service: b.totals.service,
        vat: b.totals.vat, total: b.totals.total, paid: b.totals.paid, balance: b.totals.balance,
      },
      split: b.split
        ? { parts: b.split.parts, share: b.split.share, paidParts: b.split.paid_parts, remaining: b.split.remaining, due: b.split.due }
        : null,
      amounts: { all: b.amounts.all, itemsBase: b.amounts.items_base },
      othersPaying: !!b.others_paying,
      paidOutside: b.paid_outside ?? 0,
    };
  }
  return {
    view: raw.view,
    tableNumber: raw.table_number,
    serverTime: raw.server_time,
    billId: b?.id ?? null,
    outcome: raw.view === "finished" ? (b?.outcome ?? "paid") : null,
    restaurant: {
      name: raw.restaurant.name,
      primaryColor: raw.restaurant.primary_color,
      logoUrl: raw.restaurant.logo_url ?? null,
      serviceRate: Number(raw.restaurant.service_rate ?? 0),
      vatRate: Number(raw.restaurant.vat_rate ?? 0),
      pricesIncludeTaxes: !!raw.restaurant.prices_include_taxes,
      sinpe: raw.restaurant.sinpe ?? null,
      methods: raw.restaurant.methods ?? ["card", "apple_pay", "google_pay", "sinpe"],
    },
    bill,
  };
}
