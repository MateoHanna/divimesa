// Datos del checkout y del comprobante (función SQL payment_receipt).
export interface Receipt {
  id: string;
  status: "pending" | "paid" | "failed";
  amount: number;
  tip: number;
  method: string;
  paidAt: string | null;
  token: string;
  tableNumber: number;
  restaurant: string;
  primaryColor: string;
  logoUrl: string | null;
  showDeclineDemo: boolean;
  invoiceEmail: string | null;
}

interface RawReceipt {
  id: string; status: Receipt["status"]; amount: number; tip: number; method: string; paid_at: string | null;
  token: string; table_number: number; restaurant: string; primary_color: string; logo_url?: string | null; show_decline_demo: boolean;
  invoice_email: string | null;
}

export const METHOD_LABELS: Record<string, string> = {
  card: "Tarjeta", apple_pay: "Apple Pay", google_pay: "Google Pay", sinpe: "SINPE Móvil", terminal: "Datáfono", cash: "Efectivo",
};

export function toReceipt(r: RawReceipt): Receipt {
  return {
    id: r.id, status: r.status, amount: r.amount, tip: r.tip, method: r.method, paidAt: r.paid_at,
    token: r.token, tableNumber: r.table_number, restaurant: r.restaurant, primaryColor: r.primary_color, logoUrl: r.logo_url ?? null,
    showDeclineDemo: r.show_decline_demo, invoiceEmail: r.invoice_email?.trim() || null,
  };
}
