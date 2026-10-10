import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PinForm } from "@/components/panel/pin-form";
import { PrintButton } from "@/components/panel/print-button";
import { QrCard } from "@/components/panel/qr-card";
import { Button } from "@/components/ui/button";
import { tableUrl } from "@/lib/app-url";
import { loadAllTableTokens } from "@/lib/panel/queries";
import { hasPanelSession } from "@/lib/panel/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "QR de la mesa", robots: { index: false, follow: false } };

// Una sola tarjeta, más grande (1,5 veces), en una hoja Letter.
const PRINT_CSS = `
@page { size: letter portrait; margin: 8mm; }
@media print { html, body { background: #fff !important; } }
`;

export default async function QrPage({ params }: { params: Promise<{ mesa: string }> }) {
  // Sin sesión del panel no se consulta nada: el token de la mesa nunca sale sin ella.
  if (!(await hasPanelSession())) return <PinForm />;

  const { mesa } = await params;
  const number = Number(mesa);
  if (!Number.isInteger(number) || number < 1 || number > 9999) notFound();
  const { restaurant, tables } = await loadAllTableTokens();
  const table = tables.find((t) => t.number === number);
  if (!table) notFound();
  const url = tableUrl(table.token); // siempre APP_URL + /m/<token>, nunca el número de mesa

  return (
    <main className="mx-auto flex max-w-3xl flex-col items-center gap-4 p-4 print:p-0">
      <style>{PRINT_CSS}</style>
      <div className="flex w-full justify-between print:hidden">
        <Button variant="ghost" asChild><Link href="/panel">← Volver al panel</Link></Button>
        <PrintButton />
      </div>
      <div className="max-w-full overflow-x-auto print:overflow-visible">
        <QrCard brand={restaurant} number={table.number} url={url} unit={1.5} />
      </div>
      <p className="text-sm break-all text-muted-foreground print:hidden">{url}</p>
    </main>
  );
}
