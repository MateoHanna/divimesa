// Estado público de una mesa para la página del cliente. Sin tokens, facturas ni sesiones ajenas.

export interface ClientLine {
  id: string;
  name: string;
  /** Precio de la línea en colones (sin servicio ni IVA). */
  amount: number;
  status: "pending" | "paid";
  /** 'me': apartada por esta sesión; 'other': apartada por otra persona; 'none': libre. */
  reserved: "none" | "me" | "other";
  reservedUntil: string | null;
  splitGroupId: string | null;
}

export interface ClientTotals {
  itemsSum: number;
  subtotal: number;
  service: number;
  vat: number;
  total: number;
  paid: number;
  balance: number;
}

export interface ClientSplit {
  parts: number;
  share: number;
  paidParts: number;
  /** Partes que todavía nadie pagó ni tiene en pago. */
  remaining: number;
  /** Lo que paga la próxima persona. */
  due: number;
}

/**
 * Pago por confirmar más reciente de esta sesión: un SINPE Móvil o una solicitud de datáfono
 * ("tarjeta con el salonero"). La solicitud de datáfono nace ya reportada.
 */
export interface MySinpe {
  id: string;
  method: "sinpe" | "terminal";
  /** 'pending': en instrucciones (reported=false) o por confirmar (reported=true). */
  status: "pending" | "paid" | "failed";
  /** Lo que baja el saldo. El cliente transfiere amount + tip. */
  amount: number;
  tip: number;
  code: string | null;
  reported: boolean;
  kind: "full" | "items" | "equal_share" | "amount";
}

export interface ClientBill {
  id: string;
  /** 'total': el salonero digitó el total; no hay lista de platos. */
  mode: "items" | "total";
  mySinpe: MySinpe | null;
  lines: ClientLine[];
  totals: ClientTotals;
  split: ClientSplit | null;
  /** Saldo que esta sesión puede pagar ("Pagar todo") y base del cálculo por platos. */
  amounts: { all: number; itemsBase: number };
  /** Otra sesión tiene un pago en curso. */
  othersPaying: boolean;
  /** Pagado por monto desde el panel (datáfono o efectivo): explica el ajuste de "Mis platos". */
  paidOutside: number;
}

export interface ClientState {
  view: "no_bill" | "open" | "finished";
  tableNumber: number;
  restaurant: {
    name: string; primaryColor: string; logoUrl: string | null; serviceRate: number; vatRate: number; pricesIncludeTaxes: boolean;
    /** Datos para el SINPE (en la demo, un número de prueba). Null si el restaurante no lo configuró. */
    sinpe: { number: string; holder: string; test: boolean } | null;
    /** Métodos que ofrece este restaurante. Un restaurante real ofrece SINPE (si lo configuró) y el datáfono. */
    methods: PayMethod[];
  };
  serverTime: string;
  /** Id de la cuenta actual (o de la última, si ya terminó). Cambia cuando abren una cuenta nueva. */
  billId: string | null;
  /** Solo en view 'finished': 'paid' si se pagó completa, 'closed' si el salonero la cerró con saldo. */
  outcome: "paid" | "closed" | null;
  bill: ClientBill | null;
}

export type PayMode = "all" | "items" | "equal" | "amount";
/** 'terminal': tarjeta con el datáfono del restaurante (el salonero la cobra en la mesa). */
export type PayMethod = "card" | "apple_pay" | "google_pay" | "sinpe" | "terminal";
export type TipChoice = { type: "percent"; value: 0 | 5 | 10 } | { type: "amount"; value: number };

export interface InvoiceInput {
  name?: string;
  idType?: "fisica" | "juridica";
  idNumber?: string;
  email?: string;
}

export interface Unavailable { id: string; reason: "paid" | "reserved" | "gone" }
