"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatCRC } from "@/lib/money";

/** Colones enteros a partir de lo que escribe el salonero ("25 000", "25000"). 0 si no es válido. */
export function parseColones(text: string): number {
  const n = Number(text.replace(/\D/g, ""));
  return Number.isSafeInteger(n) && n <= 100_000_000 ? n : 0;
}

/** Corregir el total de una cuenta de solo el total. */
export function TotalDialog({
  open, onOpenChange, current, paid, busy, onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  current: number;
  paid: number;
  busy: boolean;
  onSave: (total: number) => Promise<boolean>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <TotalForm current={current} paid={paid} busy={busy} onSave={onSave} onClose={() => onOpenChange(false)} /> : null}
    </Dialog>
  );
}

function TotalForm({
  current, paid, busy, onSave, onClose,
}: { current: number; paid: number; busy: boolean; onSave: (t: number) => Promise<boolean>; onClose: () => void }) {
  const [text, setText] = useState(String(current));
  const total = parseColones(text);
  const tooLow = total > 0 && total < paid;
  const valid = total > 0 && total !== current && !tooLow;
  return (
    <DialogContent title="Corregir el total" description={`Ahora es ${formatCRC(current)}. Tiene que incluir servicio e impuestos.`}>
      <Input inputMode="numeric" autoFocus aria-label="Nuevo total en colones" className="h-14 text-center text-2xl"
        value={text} onChange={(e) => setText(e.target.value)} />
      {tooLow ? <p role="alert" className="text-sm text-destructive">Ya se pagaron {formatCRC(paid)}. El total no puede ser menor.</p> : null}
      <Button size="xl" disabled={!valid || busy} onClick={async () => { if (await onSave(total)) onClose(); }}>
        Guardar {valid ? formatCRC(total) : ""}
      </Button>
      <Button size="lg" variant="outline" onClick={onClose}>Cancelar</Button>
    </DialogContent>
  );
}
