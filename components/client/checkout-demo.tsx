"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

import { call } from "./call";

export function CheckoutDemo({
  paymentId, status, token, amount, tip, total, method,
}: { paymentId: string; status: string; token: string | null; amount: string; tip: string | null; total: string; method: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const back = token ? `/m/${token}` : "/";

  async function volver() {
    setBusy(true);
    setError(null);
    // Cancela el pago pendiente propio y suelta lo apartado, para no bloquear a nadie al volver.
    const res = await call<{ token?: string }>(`/api/payments/${paymentId}/cancel`, "POST");
    if (res.status === 0) {
      setBusy(false);
      setError("Sin conexión. Intente de nuevo.");
      return;
    }
    window.location.assign(res.json?.token ? `/m/${res.json.token}` : back);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-5 px-4 py-8">
      <h1 className="text-2xl font-extrabold">Confirmar pago</h1>
      <dl className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
        <div className="flex justify-between"><dt>Cuenta</dt><dd className="tabular-nums">{amount}</dd></div>
        {tip ? <div className="flex justify-between"><dt>Propina</dt><dd className="tabular-nums">{tip}</dd></div> : null}
        <div className="flex justify-between text-xl font-bold"><dt>Total</dt><dd className="tabular-nums">{total}</dd></div>
        <div className="flex justify-between text-sm text-muted-foreground"><dt>Método</dt><dd>{method}</dd></div>
      </dl>
      {status === "pending" ? (
        <>
          <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            Pantalla de demostración. El pago simulado se activa en la siguiente etapa.
          </p>
          <Button size="xl" disabled>Pagar {total}</Button>
          <Button size="xl" variant="outline" disabled={busy} onClick={volver}>Volver</Button>
        </>
      ) : (
        <>
          <p role="status" className="text-base">{status === "paid" ? "Este pago ya se realizó." : "Este pago ya no está activo."}</p>
          <Button size="xl" onClick={() => window.location.assign(back)}>Volver a la cuenta</Button>
        </>
      )}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </main>
  );
}
