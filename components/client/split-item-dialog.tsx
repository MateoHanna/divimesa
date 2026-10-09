"use client";

import { useState } from "react";
import { MinusIcon, PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { formatCRC, splitEqual } from "@/lib/money";

export function SplitItemDialog({
  target, onClose, busy, onConfirm,
}: {
  target: { id: string; name: string; amount: number } | null;
  onClose: () => void;
  busy: boolean;
  onConfirm: (id: string, parts: number) => Promise<boolean>;
}) {
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      {target ? <Form key={target.id} target={target} onClose={onClose} busy={busy} onConfirm={onConfirm} /> : null}
    </Dialog>
  );
}

function Form({
  target, onClose, busy, onConfirm,
}: {
  target: { id: string; name: string; amount: number };
  onClose: () => void;
  busy: boolean;
  onConfirm: (id: string, parts: number) => Promise<boolean>;
}) {
  const [parts, setParts] = useState(2);
  const max = Math.min(12, target.amount);
  const shares = splitEqual(target.amount, parts);
  const last = shares[shares.length - 1];
  return (
    <DialogContent title="Dividir este plato" description={`${target.name}: ${formatCRC(target.amount)}. ¿Entre cuántas personas?`}>
      <div className="flex items-center justify-center gap-4">
        <Button variant="outline" size="icon" className="size-14" aria-label="Menos personas" disabled={parts <= 2}
          onClick={() => setParts(parts - 1)}><MinusIcon /></Button>
        <span className="w-16 text-center text-4xl font-bold tabular-nums" aria-live="polite">{parts}</span>
        <Button variant="outline" size="icon" className="size-14" aria-label="Más personas" disabled={parts >= max}
          onClick={() => setParts(parts + 1)}><PlusIcon /></Button>
      </div>
      <p className="text-center text-sm text-muted-foreground">
        Cada parte: {formatCRC(shares[0])}{last !== shares[0] ? ` (la última, ${formatCRC(last)})` : ""}. Después elija la suya.
      </p>
      <Button size="xl" disabled={busy} onClick={async () => { if (await onConfirm(target.id, parts)) onClose(); }}>
        Dividir en {parts} partes
      </Button>
      <Button size="lg" variant="outline" onClick={onClose}>Cancelar</Button>
    </DialogContent>
  );
}
