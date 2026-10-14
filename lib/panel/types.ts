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

/** Datos de factura que dejó el cliente junto a su pago (solo los ve el personal del restaurante). */
export interface PanelInvoice {
  name: string | null;
  idType: "fisica" | "juridica" | null;
  idNumber: string | null;
  email: string | null;
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
  /** Código de referencia del SINPE (por ejemplo M4-7K2). */
  code: string | null;
  payerName: string | null;
  invoice: PanelInvoice | null;
}

/**
 * Pago por confirmar: un SINPE que el cliente dice haber hecho, o una solicitud de datáfono ("tarjeta con el
 * salonero") que el salonero todavía no cobra.
 */
export interface PendingPayment {
  id: string;
  method: "sinpe" | "terminal";
  /** Lo que baja el saldo de la cuenta. */
  amount: number;
  /** Propina aparte: el cliente paga amount + tip (transferencia o datáfono). */
  tip: number;
  kind: PanelPayment["kind"];
  code: string | null;
  payerName: string | null;
  reportedAt: string;
  invoice: PanelInvoice | null;
}

export interface PanelSplit {
  parts: number;
  share: number;
  paidParts: number;
}

export interface PanelBill {
  id: string;
  /** 'total': el salonero digitó el total (ya con servicio e impuestos) y no hay platos. */
  mode: "items" | "total";
  status: "open" | "paid";
  openedAt: string;
  paidAt: string | null;
  lines: PanelLine[];
  totals: PanelTotals;
  split: PanelSplit | null;
  payments: PanelPayment[];
  pending: PendingPayment[];
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
  restaurant: {
    id: string; name: string; primaryColor: string; logoUrl: string | null; showDeclineDemo: boolean;
    billMode: "items" | "total"; isDemo: boolean; sinpeNumber: string | null; sinpeHolder: string | null;
  };
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
