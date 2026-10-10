import { cn } from "@/lib/utils";

/** Logo horizontal de Divimesa, tal cual vienen los archivos de public/brand. */
export function DivimesaLogo({ dark, className }: { dark?: boolean; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={dark ? "/brand/divimesa-horizontal-fondo-oscuro.svg" : "/brand/divimesa-horizontal.svg"}
      alt="Divimesa" width={391} height={110} decoding="async" className={cn("h-6 w-auto", className)} />
  );
}

/** Pie discreto de las pantallas del cliente. */
export function DivimesaFooter({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-center justify-center gap-1.5 pt-1 text-xs text-muted-foreground", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/divimesa-icono.svg" alt="" width={16} height={16} className="size-4" />
      Pagos con <span className="font-semibold text-foreground">Divimesa</span>
    </p>
  );
}
