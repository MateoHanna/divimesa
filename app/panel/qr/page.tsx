import type { Metadata } from "next";
import Link from "next/link";

import { PinForm } from "@/components/panel/pin-form";
import { PrintButton } from "@/components/panel/print-button";
import { QrView } from "@/components/panel/qr-view";
import { Button } from "@/components/ui/button";
import { tableUrl } from "@/lib/app-url";
import { loadAllTableTokens } from "@/lib/panel/queries";
import { hasPanelSession } from "@/lib/panel/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Imprimir QR de las mesas", robots: { index: false, follow: false } };

export default async function AllQrPage() {
  // Sin cookie del PIN no se consulta nada: los tokens de las mesas nunca salen sin sesión.
  if (!(await hasPanelSession())) return <PinForm />;
  const { restaurant, tables } = await loadAllTableTokens();

  return (
    <main className="mx-auto max-w-4xl p-4 print:max-w-none print:p-0">
      <style>{"@media print { @page { size: A4 portrait; margin: 10mm; } }"}</style>
      <div className="mb-4 flex items-center justify-between gap-2 print:hidden">
        <Button variant="ghost" asChild><Link href="/panel">← Volver al panel</Link></Button>
        <PrintButton />
      </div>
      <p className="mb-4 text-sm text-muted-foreground print:hidden">
        Una hoja A4 con las {tables.length} mesas. Cada QR lleva a la cuenta de su mesa; el número impreso es solo para ubicarlo.
      </p>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-0 print:grid-cols-2 print:gap-0">
        {tables.map((t) => (
          <li key={t.number}
            className="flex items-center gap-4 border border-dashed p-4 break-inside-avoid print:h-[69mm] print:border-neutral-400">
            <QrView bare value={tableUrl(t.token)} className="w-36 print:w-[50mm]" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground print:text-neutral-700">{restaurant}</p>
              <p className="text-5xl font-extrabold">Mesa {t.number}</p>
              <p className="mt-1 text-sm">Escaneá para ver y pagar tu cuenta</p>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
