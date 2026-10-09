"use client";

import { useMemo, useState } from "react";
import { MinusIcon, PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { amountForItems, formatCRC } from "@/lib/money";
import { groupLines } from "@/lib/panel/state";
import type { PanelBill } from "@/lib/panel/types";
import { cn } from "@/lib/utils";

type Method = "terminal" | "cash";
type Kind = "amount" | "items";

export function PaymentDialog({
  bill, tableNumber, open, onOpenChange, busy, onPay,
}: {
  bill: PanelBill;
  tableNumber: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onPay: (body: { method: Method } & ({ kind: "amount"; amount: number } | { kind: "items"; itemIds: string[] }), shownAmount: number) => Promise<boolean>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <PaymentForm bill={bill} tableNumber={tableNumber} onOpenChange={onOpenChange} busy={busy} onPay={onPay} /> : null}
    </Dialog>
  );
}

function PaymentForm({
  bill, tableNumber, onOpenChange, busy, onPay,
}: {
  bill: PanelBill;
  tableNumber: number;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onPay: React.ComponentProps<typeof PaymentDialog>["onPay"];
}) {
  const [method, setMethod] = useState<Method>("terminal");
  const [kind, setKind] = useState<Kind>("amount");
  const [text, setText] = useState("");
  const [take, setTake] = useState<Record<string, number>>({});
  const balance = bill.totals.balance;

  const pendingLines = useMemo(() => bill.lines.filter((l) => l.status === "pending"), [bill.lines]);
  const groups = useMemo(() => groupLines(pendingLines), [pendingLines]);

  // Platos elegidos: por grupo se toman las primeras N líneas libres.
  const selectedIds = useMemo(
    () => groups.flatMap((g) => {
      const free = pendingLines.filter((l) => g.ids.includes(l.id) && !l.reserved).map((l) => l.id);
      return free.slice(0, take[g.key] ?? 0);
    }),
    [groups, pendingLines, take],
  );
  const lineAmount = (id: string) => pendingLines.find((l) => l.id === id)?.unitPrice ?? 0;
  const itemsAmount = selectedIds.length
    ? amountForItems(
        selectedIds.map((id) => ({ id, amount: lineAmount(id) })),
        pendingLines.map((l) => ({ id: l.id, amount: l.unitPrice })),
        balance,
      )
    : 0;
  const selectedSum = selectedIds.reduce((s, id) => s + lineAmount(id), 0);

  const amount = Number(text.replace(/\D/g, ""));
  const amountOk = Number.isInteger(amount) && amount > 0 && amount <= balance;
  const canPay = kind === "amount" ? amountOk : selectedIds.length > 0 && itemsAmount > 0;
  const payAmount = kind === "amount" ? amount : itemsAmount;

  return (
    <DialogContent title={`Registrar pago · Mesa ${tableNumber}`} description={`Saldo pendiente: ${formatCRC(balance)}`}>
      <Segmented value={method} onChange={setMethod} label="Forma de pago"
        options={[{ v: "terminal", t: "Datáfono" }, { v: "cash", t: "Efectivo" }]} />
      <Segmented value={kind} onChange={setKind} label="Qué se paga"
        options={[{ v: "amount", t: "Por monto" }, { v: "items", t: "Por platos" }]} />

      {kind === "amount" ? (
        <div className="flex flex-col gap-2">
          <Input inputMode="numeric" aria-label="Monto en colones" placeholder="₡ 0" className="h-14 text-center text-2xl"
            value={text} onChange={(e) => setText(e.target.value)} />
          <Button variant="outline" onClick={() => setText(String(balance))}>Todo el saldo ({formatCRC(balance)})</Button>
          {text && amount > balance ? <p role="alert" className="text-sm text-destructive">El monto es mayor al saldo.</p> : null}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <ul className="flex flex-col divide-y rounded-xl border">
            {groups.map((g) => {
              const freeCount = pendingLines.filter((l) => g.ids.includes(l.id) && !l.reserved).length;
              const n = take[g.key] ?? 0;
              return (
                <li key={g.key} className="flex items-center gap-2 p-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{g.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatCRC(g.unitPrice)} · quedan {g.count}
                      {g.reservedCount ? ` (${g.reservedCount} en pago por QR)` : ""}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" aria-label={`Menos ${g.name}`} disabled={n <= 0}
                    onClick={() => setTake({ ...take, [g.key]: n - 1 })}><MinusIcon /></Button>
                  <span className="w-6 text-center tabular-nums">{n}</span>
                  <Button variant="ghost" size="icon" aria-label={`Más ${g.name}`} disabled={n >= freeCount}
                    onClick={() => setTake({ ...take, [g.key]: n + 1 })}><PlusIcon /></Button>
                </li>
              );
            })}
          </ul>
          {selectedIds.length > 0 && itemsAmount !== selectedSum ? (
            <p className="rounded-lg bg-muted p-2 text-sm">
              Platos elegidos: {formatCRC(selectedSum)} sin recargos. Con servicio, IVA y lo ya pagado, les toca {formatCRC(itemsAmount)}.
            </p>
          ) : null}
        </div>
      )}

      <Button size="xl" disabled={!canPay || busy} onClick={async () => {
        const ok = await onPay(kind === "amount" ? { method, kind, amount } : { method, kind, itemIds: selectedIds }, payAmount);
        if (ok) onOpenChange(false);
      }}>
        Cobrar {canPay ? formatCRC(payAmount) : ""} con {method === "cash" ? "efectivo" : "datáfono"}
      </Button>
      <Button size="lg" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
    </DialogContent>
  );
}

function Segmented<T extends string>({
  value, onChange, options, label,
}: { value: T; onChange: (v: T) => void; options: { v: T; t: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
      {options.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)}
          className={cn("h-11 rounded-lg text-sm font-medium transition", value === o.v ? "bg-background shadow-sm" : "text-muted-foreground")}>
          {o.t}
        </button>
      ))}
    </div>
  );
}
