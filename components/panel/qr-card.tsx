import { BrandMark } from "@/components/brand/brand-mark";
import { QrView } from "@/components/panel/qr-view";
import { readableOn } from "@/lib/branding";

export interface QrBrand { name: string; primaryColor: string; logoUrl: string | null }

/**
 * Tarjeta del QR de una mesa. Todas las medidas son múltiplos de --u (en mm), así la misma tarjeta sirve en
 * 2 x 2 por hoja Letter (--u: 1mm, tarjeta de 100 x 131 mm) y sola en la hoja (--u: 1.5mm).
 */
export function QrCard({ brand, number, url, unit = 1 }: { brand: QrBrand; number: number; url: string; unit?: number }) {
  const u = (k: number) => `calc(var(--u) * ${k})`;
  const ink = readableOn(brand.primaryColor);
  return (
    <div style={{ ["--u" as string]: `${unit}mm`, width: u(100), height: u(131.5) }}
      className="flex flex-col overflow-hidden rounded-[2mm] border border-dashed border-neutral-400 bg-white text-center text-neutral-950 [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
      <div className="flex items-center justify-center gap-[2.5mm]" style={{ background: brand.primaryColor, color: ink, height: u(22), padding: `0 ${u(6)}` }}>
        {brand.logoUrl ? <BrandMark name={brand.name} logoUrl={brand.logoUrl} className="size-[calc(var(--u)*14)] rounded-[2mm]" /> : null}
        <p className="min-w-0 truncate font-bold" style={{ fontSize: u(6.5) }}>{brand.name}</p>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center" style={{ gap: u(2.5), padding: u(5) }}>
        <QrView bare value={url} className="w-[calc(var(--u)*62)]" />
        <p className="leading-none font-extrabold" style={{ fontSize: u(15) }}>Mesa {number}</p>
        <p className="font-medium" style={{ fontSize: u(5.2) }}>Escanee para ver y pagar su cuenta</p>
        <p className="text-neutral-600" style={{ fontSize: u(3.4) }}>Pagos con Divimesa</p>
      </div>
    </div>
  );
}
