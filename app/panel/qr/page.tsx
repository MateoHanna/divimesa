import type { Metadata } from "next";
import Link from "next/link";

import { PinForm } from "@/components/panel/pin-form";
import { PrintButton } from "@/components/panel/print-button";
import { QrCard } from "@/components/panel/qr-card";
import { Button } from "@/components/ui/button";
import { tableUrl } from "@/lib/app-url";
import { loadAllTableTokens } from "@/lib/panel/queries";
import { hasPanelSession } from "@/lib/panel/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Imprimir QR de las mesas", robots: { index: false, follow: false } };

const PER_PAGE = 4;

// Hoja Letter (8,5 x 11 in) con 4 tarjetas de 100 x 131,5 mm (2 x 2). Con margen de 8 mm el área útil es de
// 199,9 x 263,4 mm; la altura de la página queda 1 mm por debajo para que nunca salte una hoja en blanco.
const PRINT_CSS = `
@page { size: letter portrait; margin: 8mm; }
.qr-pages { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.qr-page { display: grid; grid-template-columns: 100mm 100mm; grid-template-rows: 131.5mm 131.5mm; width: 200mm; height: 263mm;
  background: #fff; box-shadow: 0 0 0 1px #d4d4d4; }
@media print {
  html, body { background: #fff !important; }
  .qr-pages { display: block; gap: 0; }
  .qr-page { box-shadow: none; break-after: page; break-inside: avoid; }
  .qr-page:last-child { break-after: auto; }
}
`;

export default async function AllQrPage() {
  // Sin sesión del panel no se consulta nada: los tokens de las mesas nunca salen sin ella.
  if (!(await hasPanelSession())) return <PinForm />;
  const { restaurant, tables } = await loadAllTableTokens();
  const pages: (typeof tables)[] = [];
  for (let i = 0; i < tables.length; i += PER_PAGE) pages.push(tables.slice(i, i + PER_PAGE));

  return (
    <main className="mx-auto max-w-4xl p-4 print:max-w-none print:p-0">
      <style>{PRINT_CSS}</style>
      <div className="mb-4 flex items-center justify-between gap-2 print:hidden">
        <Button variant="ghost" asChild><Link href="/panel">← Volver al panel</Link></Button>
        <PrintButton />
      </div>
      <p className="mb-4 text-sm text-muted-foreground print:hidden">
        {tables.length} mesas en {pages.length} {pages.length === 1 ? "hoja" : "hojas"} tamaño Carta (Letter), cuatro por hoja. Al imprimir,
        elija tamaño Carta, escala 100 % y márgenes predeterminados. Corte por las líneas punteadas. Cada QR lleva a la cuenta de su mesa.
      </p>
      <div className="overflow-x-auto print:overflow-visible">
        <div className="qr-pages">
          {pages.map((page, i) => (
            <section key={i} className="qr-page" aria-label={`Hoja ${i + 1} de ${pages.length}`}>
              {page.map((t) => <QrCard key={t.number} brand={restaurant} number={t.number} url={tableUrl(t.token)} />)}
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
