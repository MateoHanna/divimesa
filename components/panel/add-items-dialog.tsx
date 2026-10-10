"use client";

import { useMemo, useState } from "react";
import { MinusIcon, PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { formatCRC } from "@/lib/money";
import type { PanelMenuItem } from "@/lib/panel/types";

export function AddItemsDialog({
  open, onOpenChange, menu, busy, onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  menu: PanelMenuItem[];
  busy: boolean;
  onAdd: (menuItemId: string, quantity: number) => Promise<boolean>;
}) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [added, setAdded] = useState<Record<string, number>>({});
  const categories = useMemo(() => {
    const map = new Map<string, PanelMenuItem[]>();
    for (const m of menu) map.set(m.category, [...(map.get(m.category) ?? []), m]);
    return [...map.entries()];
  }, [menu]);

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setQty({}); setAdded({}); } }}>
      <DialogContent title="Agregar platos" description="Elija la cantidad y toque Agregar. Cada unidad queda como una línea.">
        <div className="flex flex-col gap-5">
          {categories.map(([cat, list]) => (
            <section key={cat}>
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{cat}</h3>
              <ul className="flex flex-col divide-y rounded-xl border">
                {list.map((m) => {
                  const q = qty[m.id] ?? 1;
                  return (
                    <li key={m.id} className="flex items-center gap-2 p-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{m.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatCRC(m.price)}
                          {added[m.id] ? <span className="ml-2 font-medium text-emerald-700">+{added[m.id]} agregados</span> : null}
                        </p>
                      </div>
                      <div className="flex items-center">
                        <Button variant="ghost" size="icon" aria-label={`Menos ${m.name}`} disabled={q <= 1}
                          onClick={() => setQty({ ...qty, [m.id]: q - 1 })}><MinusIcon /></Button>
                        <span className="w-6 text-center tabular-nums">{q}</span>
                        <Button variant="ghost" size="icon" aria-label={`Más ${m.name}`} disabled={q >= 20}
                          onClick={() => setQty({ ...qty, [m.id]: q + 1 })}><PlusIcon /></Button>
                      </div>
                      <Button disabled={busy} onClick={async () => {
                        if (await onAdd(m.id, q)) {
                          setAdded((a) => ({ ...a, [m.id]: (a[m.id] ?? 0) + q }));
                          setQty((s) => ({ ...s, [m.id]: 1 }));
                        }
                      }}>Agregar</Button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
        <Button size="lg" onClick={() => onOpenChange(false)}>Listo, volver a la mesa</Button>
      </DialogContent>
    </Dialog>
  );
}
