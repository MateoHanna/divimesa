import type { TableStatus } from "@/lib/panel/types";

export const STATUS_LABEL: Record<TableStatus, string> = {
  free: "Libre",
  open: "Abierta",
  partial: "Pago parcial",
  paid: "Pagada",
};

// Color y texto juntos: el estado nunca depende solo del color.
export const STATUS_CLASS: Record<TableStatus, string> = {
  free: "border-border bg-card text-muted-foreground",
  open: "border-amber-300 bg-amber-50 text-amber-900",
  partial: "border-sky-300 bg-sky-50 text-sky-900",
  paid: "border-emerald-400 bg-emerald-50 text-emerald-900",
};

export const METHOD_LABEL: Record<string, string> = {
  card: "Tarjeta",
  apple_pay: "Apple Pay",
  google_pay: "Google Pay",
  sinpe: "SINPE",
  terminal: "Datáfono",
  cash: "Efectivo",
};

export const KIND_LABEL: Record<string, string> = {
  full: "Cuenta completa",
  items: "Por platos",
  equal_share: "Parte igual",
  amount: "Por monto",
};
