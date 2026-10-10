"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { METHOD_LABELS, type Receipt } from "@/lib/client/receipt";
import { formatCRC } from "@/lib/money";

import { call } from "./call";

export function CheckoutDemo({ receipt }: { receipt: Receipt }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "paying" | "declining" | "back">(null);
  const [error, setError] = useState<string | null>(null);
  const total = receipt.amount + receipt.tip;
  const back = `/m/${receipt.token}`;

  async function submit(outcome: "paid" | "failed") {
    setBusy(outcome === "paid" ? "paying" : "declining");
    setError(null);
    // El servidor espera 1,5 s, manda el webhook firmado y responde cuando ya se aplicó.
    const res = await call<{ token?: string }>(`/api/checkout-demo/${receipt.id}/pay`, "POST", { outcome });
    if (res.json?.ok) {
      if (outcome === "failed") {
        router.push(`${back}?rechazo=1`);
        return;
      }
      router.refresh(); // el servidor ya lo tiene pagado: muestra el comprobante
      return;
    }
    if (res.json?.code === "not_pending") {
      router.refresh();
      return;
    }
    setBusy(null);
    setError(res.status === 0 ? "Sin conexión. Intente de nuevo." : (res.json?.error ?? "No se pudo completar el pago."));
  }

  async function volver() {
    setBusy("back");
    setError(null);
    // Cancela el pago pendiente propio y suelta lo apartado, para no bloquear a nadie al volver.
    const res = await call<{ token?: string }>(`/api/payments/${receipt.id}/cancel`, "POST");
    if (res.status === 0) {
      setBusy(null);
      setError("Sin conexión. Intente de nuevo.");
      return;
    }
    router.push(back);
  }

  const style = { "--brand": receipt.primaryColor } as React.CSSProperties;
  const head = (
    <header className="-mx-4 border-b-4 px-4 pb-3 pt-5" style={{ borderColor: "var(--brand)" }}>
      <p className="text-sm font-medium text-muted-foreground">{receipt.restaurant}</p>
      <h1 className="text-2xl font-extrabold">Mesa {receipt.tableNumber}</h1>
    </header>
  );
  const rows = (
    <dl className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
      <div className="flex justify-between"><dt>Cuenta</dt><dd className="tabular-nums">{formatCRC(receipt.amount)}</dd></div>
      {receipt.tip > 0 ? <div className="flex justify-between"><dt>Propina</dt><dd className="tabular-nums">{formatCRC(receipt.tip)}</dd></div> : null}
      <div className="flex justify-between text-xl font-bold"><dt>Total</dt><dd className="tabular-nums">{formatCRC(total)}</dd></div>
      <div className="flex justify-between text-sm text-muted-foreground"><dt>Método</dt><dd>{METHOD_LABELS[receipt.method] ?? receipt.method}</dd></div>
    </dl>
  );

  if (receipt.status === "paid") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-5 px-4 pb-10" style={style}>
        {head}
        <div role="status" className="flex flex-col items-center gap-2 rounded-2xl border border-emerald-300 bg-emerald-50 p-6 text-center text-emerald-950">
          <CheckIcon className="size-10" aria-hidden />
          <h2 className="text-2xl font-bold">Pago recibido</h2>
          {receipt.paidAt ? (
            <p className="text-sm">{new Date(receipt.paidAt).toLocaleString("es-CR", { dateStyle: "long", timeStyle: "short" })}</p>
          ) : null}
        </div>
        {rows}
        {receipt.invoiceEmail ? (
          <p className="rounded-xl border p-3 text-sm">Factura enviada a <strong>{receipt.invoiceEmail}</strong></p>
        ) : null}
        <p className="text-xs text-muted-foreground">Demostración: no se cobró dinero real ni se envió ningún correo.</p>
        <Button size="xl" onClick={() => router.push(back)}>Volver a la cuenta</Button>
      </main>
    );
  }

  if (receipt.status === "failed") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-5 px-4 pb-10" style={style}>
        {head}
        <p role="status" className="text-base">Este pago ya no está activo. No se cobró nada.</p>
        <Button size="xl" onClick={() => router.push(back)}>Volver a la cuenta</Button>
      </main>
    );
  }

  const working = busy === "paying" || busy === "declining";
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-5 px-4 pb-10" style={style}>
      {head}
      <h2 className="text-xl font-bold">Confirmar pago</h2>
      {rows}
      <Button size="xl" className="h-16 text-xl" disabled={!!busy} onClick={() => submit("paid")}>
        {busy === "paying" ? "Procesando el pago…" : `Pagar ${formatCRC(total)}`}
      </Button>
      <Button size="xl" variant="outline" disabled={!!busy} onClick={volver}>Volver</Button>
      {working ? <p role="status" className="text-center text-sm text-muted-foreground">No cierre esta pantalla.</p> : null}
      {error ? <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
      {receipt.showDeclineDemo ? (
        <button type="button" disabled={!!busy} onClick={() => submit("failed")}
          className="mx-auto mt-6 p-2 text-xs text-muted-foreground/70 underline disabled:opacity-50">
          {busy === "declining" ? "Rechazando…" : "Simular rechazo"}
        </button>
      ) : null}
    </main>
  );
}
