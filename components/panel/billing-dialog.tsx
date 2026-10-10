"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { PanelState } from "@/lib/panel/types";
import { formatSinpeNumber } from "@/lib/sinpe";
import { cn } from "@/lib/utils";

type Act = (url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown, okText?: string) => Promise<boolean>;

/** Cómo se cobra en este restaurante: por platos o solo el total, y a qué SINPE Móvil pagan los clientes. */
export function BillingDialog({
  open, onOpenChange, restaurant, act, busy,
}: { open: boolean; onOpenChange: (o: boolean) => void; restaurant: PanelState["restaurant"] | undefined; act: Act; busy: boolean }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && restaurant ? <BillingForm restaurant={restaurant} act={act} busy={busy} onClose={() => onOpenChange(false)} /> : null}
    </Dialog>
  );
}

function BillingForm({
  restaurant, act, busy, onClose,
}: { restaurant: PanelState["restaurant"]; act: Act; busy: boolean; onClose: () => void }) {
  const [mode, setMode] = useState(restaurant.billMode);
  const [number, setNumber] = useState(restaurant.sinpeNumber ? formatSinpeNumber(restaurant.sinpeNumber) : "");
  const [holder, setHolder] = useState(restaurant.sinpeHolder ?? "");
  const digits = number.replace(/[\s-]/g, "");
  const numberOk = restaurant.isDemo || /^\d{8}$/.test(digits);
  const holderOk = restaurant.isDemo || holder.trim().length >= 2;
  const needsSinpe = mode === "total";
  const valid = !needsSinpe || (numberOk && holderOk && (restaurant.isDemo || digits !== ""));
  const changed = mode !== restaurant.billMode || (!restaurant.isDemo && (digits !== (restaurant.sinpeNumber ?? "") || holder.trim() !== (restaurant.sinpeHolder ?? "")));

  return (
    <DialogContent title="Cobro y SINPE Móvil" description="Cómo se arman las cuentas y a dónde pagan los clientes.">
      <div role="radiogroup" aria-label="Cómo se cobra" className="flex flex-col gap-2">
        {([
          { v: "items", t: "Por platos", d: "Agrega los platos y los clientes eligen qué pagar." },
          { v: "total", t: "Solo el total", d: "Usted digita el total de la cuenta (ya con servicio e impuestos) y los clientes pagan por SINPE Móvil." },
        ] as const).map((o) => (
          <button key={o.v} type="button" role="radio" aria-checked={mode === o.v} onClick={() => setMode(o.v)}
            className={cn("rounded-xl border px-4 py-3 text-left", mode === o.v ? "border-primary bg-primary text-primary-foreground" : "bg-background")}>
            <span className="block font-semibold">{o.t}</span>
            <span className={cn("block text-sm", mode === o.v ? "opacity-90" : "text-muted-foreground")}>{o.d}</span>
          </button>
        ))}
      </div>

      {restaurant.isDemo ? (
        <p className="rounded-xl bg-muted p-3 text-sm">
          En la demo el SINPE Móvil es de prueba (0000-0000). No se puede guardar un número real aquí.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Número de SINPE Móvil
            <Input inputMode="numeric" autoComplete="off" placeholder="8888-7777" className="h-12 text-lg" value={number}
              onChange={(e) => setNumber(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Nombre del titular, como sale en el banco
            <Input autoComplete="off" placeholder="Soda La Esquina S.A." className="h-12 text-lg" maxLength={80} value={holder}
              onChange={(e) => setHolder(e.target.value)} />
          </label>
          {needsSinpe && !valid ? <p role="alert" className="text-sm text-destructive">En «Solo el total» hace falta un número de 8 dígitos y el nombre del titular.</p> : null}
          <p className="text-xs text-muted-foreground">Los clientes hacen el SINPE directo a este número. Divimesa nunca recibe el dinero.</p>
        </div>
      )}

      <Button size="xl" disabled={!valid || !changed || busy} onClick={async () => {
        const body: Record<string, unknown> = { billMode: mode };
        if (!restaurant.isDemo) { body.sinpeNumber = number; body.sinpeHolder = holder; }
        if (await act("/api/panel/settings", "PATCH", body, "Cobro actualizado")) onClose();
      }}>Guardar</Button>
      <Button size="lg" variant="outline" onClick={onClose}>Cancelar</Button>
    </DialogContent>
  );
}
