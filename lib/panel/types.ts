// Tipos del estado que la API del panel le entrega al navegador. No incluyen tokens de QR.

export type TableStatus = "free" | "open" | "partial" | "paid";

export interface PanelLine {
  id: string;
  name: string;
  unitPrice: number;
  /** Solo 'pending' o 'paid': las líneas anuladas no se envían. */
  status: "pending" | "paid";
  /** Un cliente la tiene apartada ahora mismo (reserva vigente). */
  reserved: boolean;
  /** Parte de un plato dividido por el cliente (mismo id en todas las partes). */
  splitGroupId: string | null;
}

export interface PanelTotals {
  itemsSum: number;
  subtotal: number;
  service: number;
  vat: number;
  total: number;
  paid: number;
  balance: number;
}

export interface PanelPayment {
  id: string;
  amount: number;
  tip: number;
  overpaid: number;
  method: "card" | "apple_pay" | "google_pay" | "sinpe" | "terminal" | "cash";
  source: "qr" | "panel";
  kind: "full" | "items" | "equal_share" | "amount";
  paidAt: string;
  /** Platos que cubrió el pago (solo en pagos por platos), agrupados por nombre. */
  items: { name: string; count: number }[];
}

export interface PanelSplit {
  parts: number;
  share: number;
  paidParts: number;
}

export interface PanelBill {
  id: string;
  status: "open" | "paid";
  openedAt: string;
  paidAt: string | null;
  lines: PanelLine[];
  totals: PanelTotals;
  split: PanelSplit | null;
  payments: PanelPayment[];
}

export interface PanelTable {
  id: string;
  number: number;
  status: TableStatus;
  bill: PanelBill | null;
}

export interface PanelMenuItem {
  id: string;
  name: string;
  category: string;
  price: number;
}

export interface PanelState {
  restaurant: { id: string; name: string; primaryColor: string; logoUrl: string | null; showDeclineDemo: boolean };
  tables: PanelTable[];
  menu: PanelMenuItem[];
  serverTime: string;
}

/** Líneas iguales (mismo plato, precio y estado) agrupadas para mostrarlas como "2 × Casado". */
export interface LineGroup {
  key: string;
  name: string;
  unitPrice: number;
  status: "pending" | "paid";
  ids: string[];
  count: number;
  reservedCount: number;
  splitGroupId: string | null;
}
