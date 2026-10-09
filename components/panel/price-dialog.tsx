"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatCRC } from "@/lib/money";

export function PriceDialog({
  target, onClose, busy, onSave,
}: {
  target: { id: string; name: string; price: number } | null;
  onClose: () => void;
  busy: boolean;
  onSave: (id: string, price: number) => Promise<boolean>;
}) {
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      {target ? <PriceForm key={target.id} target={target} onClose={onClose} busy={busy} onSave={onSave} /> : null}
    </Dialog>
  );
}

function PriceForm({
  target, onClose, busy, onSave,
}: {
  target: { id: string; name: string; price: number };
  onClose: () => void;
  busy: boolean;
  onSave: (id: string, price: number) => Promise<boolean>;
}) {
  const [text, setText] = useState(String(target.price));
  const price = Number(text.replace(/\D/g, ""));
  const valid = Number.isInteger(price) && price > 0 && price !== target.price;
  return (
    <DialogContent title="Cambiar precio" description={`${target.name}: ahora ${formatCRC(target.price)}. Solo cambia esta línea.`}>
      <Input
        inputMode="numeric" autoFocus aria-label="Nuevo precio en colones" className="h-14 text-center text-2xl"
        value={text} onChange={(e) => setText(e.target.value)}
      />
      <Button size="xl" disabled={!valid || busy} onClick={async () => { if (await onSave(target.id, price)) onClose(); }}>
        Guardar {valid ? formatCRC(price) : ""}
      </Button>
    </DialogContent>
  );
}
