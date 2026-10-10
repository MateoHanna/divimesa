"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";

import { ClientApp } from "@/components/client/client-app";
import { DivimesaLogo } from "@/components/brand/divimesa-logo";
import { DemoPanelCard } from "@/components/demo/demo-panel-card";
import type { ClientState } from "@/lib/client/types";
import type { DemoTableView } from "@/lib/demo/table";

const QUERY = "(min-width: 1024px)";
function subscribe(cb: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
// Antes de montar no se sabe el ancho: se muestra un fondo neutro en vez de adivinar mal.
const wide = () => window.matchMedia(QUERY).matches;

export interface DemoMesaProps {
  token: string;
  client: ClientState;
  view: DemoTableView;
  host: string | null;
  qrUrl: string;
}

/**
 * Demo pública. En compu (1024 px o más): a la izquierda la cuenta dentro de un celular, a la derecha la
 * mesa como la ve el salonero, y abajo un QR para probarla en un celular de verdad. En celular: la cuenta
 * del cliente con la franja "Esto es una demo".
 */
export function DemoMesa({ token, client, view, host, qrUrl }: DemoMesaProps) {
  const isWide = useSyncExternalStore(subscribe, wide, () => null);

  if (isWide === null) return <div className="min-h-dvh bg-white" aria-busy="true" />;
  if (!isWide) {
    return <ClientApp token={token} initial={client} channel={view.channel} host={host} demo />;
  }

  return (
    <div className="flex min-h-dvh flex-col bg-slate-100">
      <p role="note" className="bg-[#1C1C1E] px-4 py-2 text-center text-sm font-semibold text-white">Esto es una demo. No se cobra nada.</p>
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 pt-5">
        <DivimesaLogo variant="wordmark" className="h-8" />
        <Link href="/" className="text-sm font-medium underline underline-offset-4">Volver a la portada</Link>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-[auto_minmax(0,1fr)] items-start gap-10 px-6 py-6">
        <section aria-labelledby="lado-cliente" className="flex flex-col items-center gap-3">
          <h2 id="lado-cliente" className="text-xl font-extrabold">Así lo ve su cliente</h2>
          <div className="relative h-[min(78dvh,760px)] min-h-[560px] w-[372px] rounded-[3rem] border-[10px] border-slate-900 bg-slate-900 shadow-2xl">
            <div aria-hidden className="absolute top-2 left-1/2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-slate-900" />
            <iframe title="Página del cliente" src={`/m/${token}?embed=1`} className="size-full rounded-[2.2rem] bg-white" />
          </div>
        </section>

        <section aria-labelledby="lado-usted" className="flex max-w-xl flex-col gap-3">
          <h2 id="lado-usted" className="text-xl font-extrabold">Así lo ve usted</h2>
          <p className="-mt-2 text-muted-foreground">El salonero ve la mesa cambiar en cuanto alguien paga.</p>
          <DemoPanelCard token={token} initial={view} channel={view.channel} />
          <div className="mt-2 flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <div className="shrink-0 rounded-lg bg-white p-1">
              <QRCodeSVG value={qrUrl} size={112} level="M" marginSize={1} role="img" aria-label="Código QR de esta cuenta de prueba" />
            </div>
            <p className="font-medium leading-snug">Escanéelo con su celular para probarlo ahí.<span className="mt-1 block text-sm font-normal text-muted-foreground">Es la misma cuenta: lo que pague en el celular se ve aquí.</span></p>
          </div>
        </section>
      </main>
    </div>
  );
}
