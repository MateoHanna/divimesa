import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PinForm } from "@/components/panel/pin-form";
import { PrintButton } from "@/components/panel/print-button";
import { QrView } from "@/components/panel/qr-view";
import { Button } from "@/components/ui/button";
import { tableUrl } from "@/lib/app-url";
import { loadTableToken } from "@/lib/panel/queries";
import { hasPanelSession } from "@/lib/panel/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "QR de la mesa", robots: { index: false, follow: false } };

export default async function QrPage({ params }: { params: Promise<{ mesa: string }> }) {
  // Sin cookie del PIN no se consulta nada: el token de la mesa nunca sale sin sesión.
  if (!(await hasPanelSession())) return <PinForm />;

  const { mesa } = await params;
  const number = Number(mesa);
  if (!Number.isInteger(number) || number < 1 || number > 9999) notFound();
  const table = await loadTableToken(number);
  if (!table) notFound();
  const url = tableUrl(table.token); // siempre APP_URL + /m/<token>, nunca el número de mesa

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center gap-6 p-6 text-center print:p-0">
      <div className="flex w-full justify-between print:hidden">
        <Button variant="ghost" asChild><Link href="/panel">← Volver al panel</Link></Button>
        <PrintButton />
      </div>
      <h1 className="text-3xl font-bold">{table.restaurant}</h1>
      <p className="text-6xl font-extrabold">Mesa {table.number}</p>
      <QrView value={url} />
      <p className="text-xl font-medium">Escanee para ver y pagar su cuenta</p>
      <p className="text-sm break-all text-muted-foreground print:hidden">{url}</p>
    </main>
  );
}
