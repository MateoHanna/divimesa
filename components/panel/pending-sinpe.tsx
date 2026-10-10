"use client";

import { useState } from "react";
import { SmartphoneIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatCRC } from "@/lib/money";
import type { PendingPayment } from "@/lib/panel/types";

import { ConfirmDialog } from "./confirm-dialog";
import { InvoiceInfo } from "./invoice-info";

/** SINPE por confirmar de una mesa: monto, código, nombre del titular, datos de factura y los dos botones. */
export function PendingSinpe({
  pending, busy, onConfirm, onReject,
}: {
  pending: PendingPayment[];
  busy: boolean;
  onConfirm: (id: string) => Promise<boolean>;
  onReject: (id: string) => Promise<boolean>;
}) {
  const [rejecting, setRejecting] = useState<PendingPayment | null>(null);
  if (pending.length === 0) return null;
  return (
    <section aria-label="SINPE por confirmar" className="flex flex-col gap-3">
      {pending.map((p) => (
        <div key={p.id} role="alert" className="flex flex-col gap-2 rounded-2xl border-2 border-rose-500 bg-rose-50 p-3 text-rose-950 shadow-md">
          <p className="flex items-center gap-2 text-xs font-bold tracking-wide uppercase">
            <SmartphoneIcon className="size-4 animate-pulse" aria-hidden /> SINPE por confirmar
          </p>
          <p className="text-3xl font-extrabold tabular-nums">{formatCRC(p.amount + p.tip)}</p>
          <p className="text-sm">
            Código <strong className="font-mono text-base tracking-wider">{p.code ?? "sin código"}</strong>
            {" · "}a nombre de <strong>{p.payerName ?? "(no escribió su nombre)"}</strong>
          </p>
          {p.tip > 0 ? <p className="text-sm">Incluye {formatCRC(p.tip)} de propina; a la cuenta le abonan {formatCRC(p.amount)}.</p> : null}
          <InvoiceInfo invoice={p.invoice} />
          <div className="mt-1 grid grid-cols-2 gap-2">
            <Button size="lg" className="h-14 bg-emerald-700 text-base font-bold text-white hover:bg-emerald-800" disabled={busy}
              onClick={() => void onConfirm(p.id)}>Recibido</Button>
            <Button size="lg" variant="outline" className="h-14 border-rose-400 bg-white text-base font-bold text-rose-800" disabled={busy}
              onClick={() => setRejecting(p)}>No llegó</Button>
          </div>
        </div>
      ))}
      <ConfirmDialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)} destructive busy={busy}
        title="¿Marcar como «No llegó»?"
        description={rejecting ? `El cliente verá que el restaurante no encontró su SINPE de ${formatCRC(rejecting.amount + rejecting.tip)}. El saldo queda libre otra vez.` : ""}
        confirmLabel="No llegó"
        onConfirm={async () => { if (rejecting) await onReject(rejecting.id); }} />
    </section>
  );
}
