"use client";

import { QRCodeSVG } from "qrcode.react";

import { cn } from "@/lib/utils";

/** QR con margen blanco (zona de silencio) y corrección de errores alta para imprimir. */
export function QrView({ value, className, bare }: { value: string; className?: string; bare?: boolean }) {
  return (
    <div className={cn("bg-white", !bare && "rounded-3xl p-4 shadow-sm ring-1 ring-border print:shadow-none print:ring-0")}>
      <QRCodeSVG value={value} size={512} level="H" marginSize={2}
        className={cn("h-auto", className ?? "w-[min(80vw,28rem)]")} role="img" aria-label="Código QR de la mesa" />
    </div>
  );
}
