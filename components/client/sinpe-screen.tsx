"use client";

import { useRef, useState } from "react";
import { CheckIcon, ClockIcon, CopyIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MySinpe } from "@/lib/client/types";
import { formatCRC } from "@/lib/money";
import { formatSinpeNumber, plainAmount } from "@/lib/sinpe";

/** Copia al portapapeles; si el navegador no deja, selecciona el texto para que lo copie a mano. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (
    <Button type="button" variant="outline" size="sm" className="h-11 shrink-0 px-3" aria-label={`Copiar ${label}`}
      onClick={async () => {
        if (!(await copyText(text))) return;
        setDone(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setDone(false), 1500);
      }}>
      {done ? <><CheckIcon aria-hidden /> Copiado</> : <><CopyIcon aria-hidden /> Copiar</>}
    </Button>
  );
}

function Field({ label, value, copy, copyLabel, mono }: { label: string; value: string; copy: string; copyLabel: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-background p-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className={mono ? "font-mono text-xl font-bold tracking-wider" : "truncate text-xl font-bold tabular-nums"}>{value}</p>
      </div>
      <CopyButton text={copy} label={copyLabel} />
    </div>
  );
}

/** Pantalla del pago por SINPE Móvil: instrucciones y, después de "Ya hice el SINPE", la espera de la confirmación. */
export function SinpeScreen({
  mine, sinpe, busy, error, onReport, onBack, onDemoConfirm,
}: {
  mine: MySinpe;
  sinpe: { number: string; holder: string; test: boolean };
  busy: boolean;
  error: string | null;
  onReport: (payerName: string) => void;
  onBack: () => void;
  /** Solo en la demo de celular: deja que quien prueba haga de salonero y confirme su SINPE de prueba. */
  onDemoConfirm?: () => void;
}) {
  const [name, setName] = useState("");
  const total = mine.amount + mine.tip;
  const number = formatSinpeNumber(sinpe.number);

  if (mine.reported) {
    return (
      <section aria-label="Esperando confirmación" className="flex flex-col items-center gap-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-6 text-center text-amber-950">
        <ClockIcon className="size-10 animate-pulse" aria-hidden />
        <h2 className="text-2xl font-bold">Esperando que el restaurante confirme su SINPE</h2>
        <p className="text-4xl font-extrabold tabular-nums">{formatCRC(total)}</p>
        {mine.code ? <p className="text-sm">Código <strong className="font-mono text-base tracking-wider">{mine.code}</strong></p> : null}
        <p className="text-sm">Deje esta pantalla abierta: se actualiza sola cuando el salonero lo confirme.</p>
        <p className="text-sm font-medium">Si pasan varios minutos, avise a su salonero.</p>
        {sinpe.test ? <p className="rounded-lg bg-white/70 px-3 py-1 text-sm font-semibold">Es una demo: no se envió dinero.</p> : null}
        {onDemoConfirm ? (
          <Button size="lg" className="mt-2 h-auto min-h-14 w-full whitespace-normal bg-emerald-700 py-2 text-base font-bold text-white hover:bg-emerald-800" onClick={onDemoConfirm}>
            Hacer de salonero: marcar «Recibido»
          </Button>
        ) : null}
      </section>
    );
  }

  return (
    <section aria-label="Pago por SINPE Móvil" className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-sm">
      <h2 className="text-xl leading-snug font-bold">
        Haga un SINPE Móvil de {formatCRC(total)} al {number} ({sinpe.holder})
      </h2>
      {sinpe.test ? (
        <p role="note" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-950">
          Número de prueba, no envíe dinero.
        </p>
      ) : null}
      {mine.tip > 0 ? <p className="-mt-2 text-sm text-muted-foreground">Incluye {formatCRC(mine.tip)} de propina.</p> : null}

      <div className="flex flex-col gap-2">
        <Field label="Número" value={number} copy={sinpe.number} copyLabel="el número" />
        <Field label="Monto" value={formatCRC(total)} copy={plainAmount(total)} copyLabel="el monto" />
        {mine.code ? <Field label="En el detalle del SINPE escriba" value={mine.code} copy={mine.code} copyLabel="el código" mono /> : null}
      </div>
      <p className="text-sm text-muted-foreground">
        El código le sirve al salonero para encontrar su pago entre los demás. Cuando termine en su banco, vuelva aquí y toque el botón.
      </p>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Su nombre como sale en su banco (opcional)
        <Input autoComplete="name" maxLength={80} className="h-12 text-base" value={name} onChange={(e) => setName(e.target.value)} />
      </label>

      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button size="xl" className="h-16 text-xl" disabled={busy} onClick={() => onReport(name)}>
        {busy ? "Un momento…" : "Ya hice el SINPE"}
      </Button>
      <Button size="lg" variant="outline" disabled={busy} onClick={onBack}>Volver</Button>
    </section>
  );
}
