"use client";

import { useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Quote } from "@/lib/client/quote";
import type { InvoiceInput, PayMethod } from "@/lib/client/types";
import { isComingSoon, orderedMethods } from "@/lib/client/methods";
import { formatCRC } from "@/lib/money";
import { cn } from "@/lib/utils";

export type TipUi = "none" | "5" | "10" | "other";

const LABELS: Record<PayMethod, string> = {
  sinpe: "SINPE Móvil", card: "Tarjeta", apple_pay: "Apple Pay", google_pay: "Google Pay",
};

export interface SummaryProps {
  quote: Quote;
  tipUi: TipUi;
  onTipUi: (t: TipUi) => void;
  otherTip: string;
  onOtherTip: (v: string) => void;
  /** Métodos que ofrece el restaurante. Un restaurante real solo ofrece SINPE Móvil. */
  methods: PayMethod[];
  method: PayMethod;
  onMethod: (m: PayMethod) => void;
  invoice: InvoiceInput;
  onInvoice: (i: InvoiceInput) => void;
  invoiceError: string | null;
  disabledReason: string | null;
  submitting: boolean;
  onPay: () => void;
}

export function PaySummary(p: SummaryProps) {
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const q = p.quote;
  const tips: { id: TipUi; label: string }[] = [
    { id: "none", label: "Sin propina" }, { id: "5", label: "5 %" }, { id: "10", label: "10 %" }, { id: "other", label: "Otro" },
  ];

  return (
    <section aria-labelledby="resumen" className="flex flex-col gap-5 rounded-2xl border bg-card p-4 shadow-sm">
      <div>
        <h2 id="resumen" className="text-sm font-medium text-muted-foreground">Monto a pagar</h2>
        <p className="text-4xl font-extrabold tabular-nums">{formatCRC(q.amount)}</p>
        {q.note ? <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-950">{q.note}</p> : null}
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Propina extra (opcional)</legend>
        <div className="grid grid-cols-4 gap-2">
          {tips.map((t) => (
            <button key={t.id} type="button" onClick={() => p.onTipUi(t.id)} aria-pressed={p.tipUi === t.id}
              className={cn("min-h-12 rounded-xl border px-1 text-sm font-medium",
                p.tipUi === t.id ? "border-primary bg-primary text-primary-foreground" : "bg-background")}>
              {t.label}
            </button>
          ))}
        </div>
        {p.tipUi === "other" ? (
          <Input inputMode="numeric" aria-label="Propina en colones" placeholder="₡ 0" className="mt-2 h-12 text-lg"
            value={p.otherTip} onChange={(e) => p.onOtherTip(e.target.value)} />
        ) : null}
        <p className="mt-2 text-xs text-muted-foreground">La cuenta ya incluye el servicio. Esta propina es extra y opcional.</p>
      </fieldset>

      <div>
        <button type="button" onClick={() => setInvoiceOpen(!invoiceOpen)} aria-expanded={invoiceOpen}
          className="flex min-h-12 w-full items-center justify-between rounded-xl border px-3 text-left text-sm font-medium">
          Datos para factura (opcional)
          <span aria-hidden className="text-lg">{invoiceOpen ? "−" : "+"}</span>
        </button>
        {invoiceOpen ? (
          <div className="mt-3 flex flex-col gap-3">
            <Input aria-label="Nombre" placeholder="Nombre o razón social" autoComplete="name" className="h-12"
              value={p.invoice.name ?? ""} onChange={(e) => p.onInvoice({ ...p.invoice, name: e.target.value })} />
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de cédula">
              {(["fisica", "juridica"] as const).map((t) => (
                <button key={t} type="button" role="radio" aria-checked={p.invoice.idType === t}
                  onClick={() => p.onInvoice({ ...p.invoice, idType: t })}
                  className={cn("min-h-12 rounded-xl border text-sm font-medium",
                    p.invoice.idType === t ? "border-primary bg-primary text-primary-foreground" : "bg-background")}>
                  {t === "fisica" ? "Cédula física" : "Cédula jurídica"}
                </button>
              ))}
            </div>
            <Input aria-label="Número de cédula" placeholder="Número de cédula" inputMode="numeric" className="h-12"
              value={p.invoice.idNumber ?? ""} onChange={(e) => p.onInvoice({ ...p.invoice, idNumber: e.target.value.replace(/\D/g, "") })} />
            <Input aria-label="Correo" placeholder="Correo para la factura" type="email" autoComplete="email" className="h-12"
              value={p.invoice.email ?? ""} onChange={(e) => p.onInvoice({ ...p.invoice, email: e.target.value })} />
            {p.invoiceError ? <p role="alert" className="text-sm text-destructive">{p.invoiceError}</p> : null}
            <p className="text-xs text-muted-foreground">
              Sus datos se usan solo para emitir su factura.{" "}
              <Link href="/privacidad" target="_blank" className="font-medium underline underline-offset-2">Política de privacidad</Link>
            </p>
          </div>
        ) : null}
      </div>

      {p.methods.length > 1 ? (
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Método de pago</legend>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Método de pago">
          {orderedMethods(p.methods).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={p.method === m} onClick={() => p.onMethod(m)}
              className={cn("flex min-h-14 flex-col items-center justify-center rounded-xl border px-1 text-base font-medium",
                p.method === m ? "border-primary bg-primary text-primary-foreground" : "bg-background")}>
              {LABELS[m]}
              {isComingSoon(m) ? <span className="text-xs font-normal opacity-80">Próximamente</span> : null}
            </button>
          ))}
        </div>
        {isComingSoon(p.method) ? (
          <p className="mt-2 text-xs text-muted-foreground">Próximamente. En esta demo se simula el pago: no se cobra nada.</p>
        ) : null}
      </fieldset>
      ) : (
        <p className="rounded-xl bg-muted p-3 text-sm">
          El pago es por <strong>SINPE Móvil</strong>, directo al restaurante. En el siguiente paso le damos el número y el monto.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {q.tip > 0 ? (
          <p className="flex justify-between text-sm"><span>Propina</span><span className="tabular-nums">{formatCRC(q.tip)}</span></p>
        ) : null}
        {p.disabledReason ? <p role="status" className="text-sm text-muted-foreground">{p.disabledReason}</p> : null}
        <Button size="xl" className="h-16 text-xl" disabled={!!p.disabledReason || p.submitting} onClick={p.onPay}>
          {p.submitting ? "Un momento…" : p.method === "sinpe" ? `Pagar ${formatCRC(q.total)} por SINPE Móvil` : `Pagar ${formatCRC(q.total)}`}
        </Button>
      </div>
    </section>
  );
}
