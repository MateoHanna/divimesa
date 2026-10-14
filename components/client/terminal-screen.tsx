"use client";

import { CreditCardIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { MySinpe } from "@/lib/client/types";
import { formatCRC } from "@/lib/money";

/**
 * "Tarjeta con el salonero": el cliente ya pidió el datáfono. El panel le avisa al salonero, que llega a la mesa,
 * cobra este monto con el datáfono del restaurante y toca "Cobrado". Divimesa no toca la tarjeta.
 */
export function TerminalScreen({
  mine, test, busy, error, onCancel, onDemoConfirm,
}: {
  mine: MySinpe;
  /** Demo: no se cobra nada. */
  test: boolean;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  /** Solo en la demo de celular: deja que quien prueba haga de salonero y marque el cobro. */
  onDemoConfirm?: () => void;
}) {
  const total = mine.amount + mine.tip;
  return (
    <section aria-label="Esperando al salonero" className="flex flex-col items-center gap-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-6 text-center text-amber-950">
      <CreditCardIcon className="size-10 animate-pulse" aria-hidden />
      <h2 className="text-2xl font-bold">El salonero viene con el datáfono</h2>
      <p className="text-4xl font-extrabold tabular-nums">{formatCRC(total)}</p>
      {mine.tip > 0 ? <p className="text-sm">Incluye {formatCRC(mine.tip)} de propina.</p> : null}
      <p className="text-sm">Tenga su tarjeta a mano. Esta pantalla se actualiza sola cuando el salonero registre el pago.</p>
      <p className="text-sm font-medium">Si pasan varios minutos, llame a su salonero.</p>
      {test ? <p className="rounded-lg bg-white/70 px-3 py-1 text-sm font-semibold">Es una demo: no se cobra nada.</p> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {onDemoConfirm ? (
        <Button size="lg" className="mt-2 h-auto min-h-14 w-full whitespace-normal bg-emerald-700 py-2 text-base font-bold text-white hover:bg-emerald-800" onClick={onDemoConfirm}>
          Marcar «Cobrado» como salonero
        </Button>
      ) : null}
      <Button size="lg" variant="outline" className="w-full border-amber-400 bg-white" disabled={busy} onClick={onCancel}>
        {busy ? "Un momento…" : "Ya no, cancelar"}
      </Button>
    </section>
  );
}
