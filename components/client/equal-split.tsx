"use client";

import { useState } from "react";
import { MinusIcon, PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { approxShare } from "@/lib/client/quote";
import type { ClientBill } from "@/lib/client/types";
import { formatCRC } from "@/lib/money";

export function EqualSplit({ bill, busy, onStart }: { bill: ClientBill; busy: boolean; onStart: (parts: number) => Promise<boolean> }) {
  const [parts, setParts] = useState(2);
  const split = bill.split;

  if (split) {
    const missing = split.parts - split.paidParts;
    const inPayment = missing - split.remaining;
    return (
      <div className="rounded-2xl border border-sky-300 bg-sky-50 p-4 text-sky-950">
        <p className="text-lg font-semibold">Faltan {missing} de {split.parts} partes, cada una de {formatCRC(split.share)}</p>
        {inPayment > 0 ? <p className="mt-1 text-sm">{inPayment === 1 ? "Una parte está" : `${inPayment} partes están`} en pago ahora mismo.</p> : null}
        {split.remaining === 1 ? <p className="mt-1 text-sm">La última parte paga lo que quede del saldo.</p> : null}
      </div>
    );
  }

  const max = Math.min(20, bill.totals.balance);
  return (
    <div className="flex flex-col gap-3 rounded-2xl border p-4">
      <p className="text-lg font-semibold">¿Entre cuántas personas?</p>
      <div className="flex items-center justify-center gap-4">
        <Button variant="outline" size="icon" className="size-14" aria-label="Menos personas" disabled={parts <= 2}
          onClick={() => setParts(parts - 1)}><MinusIcon /></Button>
        <span className="w-16 text-center text-4xl font-bold tabular-nums" aria-live="polite">{parts}</span>
        <Button variant="outline" size="icon" className="size-14" aria-label="Más personas" disabled={parts >= max}
          onClick={() => setParts(parts + 1)}><PlusIcon /></Button>
      </div>
      <p className="text-center text-sm text-muted-foreground">
        Cada persona paga cerca de {formatCRC(approxShare(bill.totals.balance, parts))}. La división vale para toda la mesa.
      </p>
      <Button size="lg" disabled={busy} onClick={() => onStart(parts)}>Dividir en {parts} partes</Button>
    </div>
  );
}
