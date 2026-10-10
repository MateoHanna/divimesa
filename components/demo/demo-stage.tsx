"use client";

import { useState } from "react";
import { MonitorIcon, SmartphoneIcon, Volume2Icon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Escenario para grabar el video: a la izquierda la página del cliente en un marco de celular,
 * a la derecha el panel del salonero. Los dos son las páginas reales, en vivo (no una maqueta).
 */
export function DemoStage({
  tables, initialTable, showBar,
}: { tables: { number: number; token: string }[]; initialTable: number; showBar: boolean }) {
  const [mesa, setMesa] = useState(initialTable);
  const token = tables.find((t) => t.number === mesa)?.token ?? tables[0]?.token;

  return (
    <div className="flex min-h-dvh flex-col bg-slate-100">
      {showBar ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-white px-4 py-2 text-sm">
          <label className="flex items-center gap-2 font-medium">
            <SmartphoneIcon className="size-4" aria-hidden /> Celular en la mesa
            <select value={mesa} onChange={(e) => setMesa(Number(e.target.value))} className="h-9 rounded-lg border bg-background px-2">
              {tables.map((t) => <option key={t.number} value={t.number}>Mesa {t.number}</option>)}
            </select>
          </label>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Volume2Icon className="size-4" aria-hidden /> Toque una vez dentro del panel para activar el sonido.
          </span>
          <span className="ml-auto text-xs text-muted-foreground">Para ocultar esta barra: agregue ?barra=0 a la dirección.</span>
        </div>
      ) : null}

      <div className="grid flex-1 grid-cols-1 gap-6 p-4 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-start lg:p-6">
        <section aria-label="Celular del cliente" className="flex justify-center">
          <div className="relative h-[min(86dvh,860px)] min-h-[620px] w-[min(100%,396px)] rounded-[3rem] border-[10px] border-slate-900 bg-slate-900 shadow-2xl">
            <div aria-hidden className="absolute top-2 left-1/2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-slate-900" />
            {token ? (
              <iframe key={token} title={`Página del cliente, Mesa ${mesa}`} src={`/m/${token}`}
                className="size-full rounded-[2.2rem] bg-white" />
            ) : null}
          </div>
        </section>

        <section aria-label="Panel del salonero" className="flex flex-col gap-2">
          <p className={cn("flex items-center gap-1.5 text-xs font-medium text-muted-foreground", !showBar && "sr-only")}>
            <MonitorIcon className="size-3.5" aria-hidden /> Panel del salonero
          </p>
          <div className="h-[min(86dvh,860px)] min-h-[620px] overflow-hidden rounded-2xl border bg-white shadow-xl">
            <iframe title="Panel del salonero" src="/panel" className="size-full" />
          </div>
        </section>
      </div>
    </div>
  );
}
