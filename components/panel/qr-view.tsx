"use client";

import { QRCodeSVG } from "qrcode.react";

/** QR grande con margen blanco (zona de silencio) y corrección de errores alta para imprimir. */
export function QrView({ value }: { value: string }) {
  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-border print:shadow-none print:ring-0">
      <QRCodeSVG value={value} size={512} level="H" marginSize={2} className="h-auto w-[min(80vw,28rem)]" role="img" aria-label="Código QR de la mesa" />
    </div>
  );
}
