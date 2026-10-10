"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useBroadcast } from "@/components/realtime/use-broadcast";
import { AnimatedMoney } from "@/components/ui/animated-number";
import { Badge } from "@/components/ui/badge";
import { useJustPaid } from "@/components/ui/use-just-paid";
import { brandVars } from "@/lib/branding";
import { displayTableNumber } from "@/lib/demo/display";
import type { DemoTableView } from "@/lib/demo/table";
import { formatCRC } from "@/lib/money";
import { groupLines } from "@/lib/panel/state";
import { cn } from "@/lib/utils";

import { KIND_LABEL, METHOD_LABEL, STATUS_CLASS, STATUS_LABEL } from "@/components/panel/status";

const POLL_MS = 2000;

/**
 * La mesa como la ve el salonero en su panel, en vivo y de solo lectura: cambia sola cuando alguien paga
 * en el celular de al lado. Pide el estado a una ruta pública que solo responde mesas de la demo.
 */
export function DemoPanelCard({ token, initial, channel }: { token: string; initial: DemoTableView; channel: string }) {
  const [view, setView] = useState(initial);
  const version = useRef(0);

  const refresh = useCallback(async () => {
    const mine = ++version.current;
    try {
      const res = await fetch(`/api/demo/mesa/${token}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as DemoTableView & { ok: boolean };
      if (mine === version.current && json.ok) setView(json);
    } catch {
      /* sin red: se reintenta en el siguiente ciclo */
    }
  }, [token]);

  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") void refresh(); };
    const t = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", tick); };
  }, [refresh]);
  useBroadcast(channel, () => void refresh());

  const { table } = view;
  const bill = table.bill;
  const justPaid = useJustPaid(bill?.lines);
  const time = (iso: string) => new Date(iso).toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex flex-col gap-4 rounded-2xl border bg-white p-4 shadow-xl" style={brandVars(view.restaurant.primaryColor) as React.CSSProperties}>
      <header className="flex items-center gap-3">
        <h3 className="text-2xl font-bold">Mesa {displayTableNumber(table.number)}</h3>
        <Badge variant="outline" className={cn("ml-auto text-sm", STATUS_CLASS[table.status])}>{STATUS_LABEL[table.status]}</Badge>
      </header>

      {bill ? (
        <>
          <ul className="flex flex-col divide-y rounded-xl border">
            {groupLines(bill.lines).map((g) => (
              <li key={g.key} className={cn("flex items-center gap-2 px-3 py-2", g.status === "paid" && "text-muted-foreground", g.ids.some((id) => justPaid.has(id)) && "animate-paid-flash")}>
                <p className="min-w-0 flex-1 font-medium">{g.count > 1 ? `${g.count} × ` : ""}{g.name}</p>
                <p className="text-sm tabular-nums">
                  {formatCRC(g.unitPrice)}{g.status === "paid" ? " · Pagado" : g.reservedCount ? " · en pago" : ""}
                </p>
              </li>
            ))}
          </ul>

          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
            <dt>Total</dt><dd className="text-right font-semibold tabular-nums"><AnimatedMoney value={bill.totals.total} /></dd>
            <dt>Pagado</dt><dd className="text-right tabular-nums"><AnimatedMoney value={bill.totals.paid} /></dd>
            <dt className="text-base font-bold">Saldo</dt><dd className="text-right text-base font-bold tabular-nums"><AnimatedMoney value={bill.totals.balance} /></dd>
          </dl>

          <section>
            <h4 className="mb-2 text-sm font-semibold text-muted-foreground">Pagos</h4>
            {bill.payments.length === 0 ? (
              <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">Cuando alguien pague en el celular, aparece aquí al instante.</p>
            ) : (
              <ul className="flex flex-col divide-y rounded-xl border">
                {bill.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 p-3 text-sm animate-paid-flash">
                    <div>
                      <p className="font-medium">{METHOD_LABEL[p.method] ?? p.method} · {KIND_LABEL[p.kind] ?? p.kind}</p>
                      <p className="text-muted-foreground">{time(p.paidAt)} · {p.source === "qr" ? "Por QR" : "Salonero"}{p.tip ? ` · propina ${formatCRC(p.tip)}` : ""}</p>
                    </div>
                    <span className="font-semibold tabular-nums">{formatCRC(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">La mesa está libre.</p>
      )}
    </div>
  );
}
