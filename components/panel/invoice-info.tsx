import type { PanelInvoice } from "@/lib/panel/types";

/** Datos de factura que dejó el cliente, para que el salonero los copie al sistema de facturación. */
export function InvoiceInfo({ invoice }: { invoice: PanelInvoice | null }) {
  if (!invoice) return null;
  const id = invoice.idNumber
    ? `${invoice.idType === "juridica" ? "Cédula jurídica" : invoice.idType === "fisica" ? "Cédula física" : "Cédula"} ${invoice.idNumber}`
    : null;
  const parts = [invoice.name, id, invoice.email].filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <p className="rounded-lg bg-muted/70 px-2 py-1 text-sm">
      <span className="font-semibold">Factura:</span> {parts.join(" · ")}
    </p>
  );
}
