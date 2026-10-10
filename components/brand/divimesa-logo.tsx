import { cn } from "@/lib/utils";

const LOGOS = {
  // Ícono y nombre.
  horizontal: { light: "/brand/divimesa-horizontal.svg", dark: "/brand/divimesa-horizontal-fondo-oscuro.svg", width: 439, height: 96 },
  // Solo el nombre.
  wordmark: { light: "/brand/divimesa-logo.svg", dark: "/brand/divimesa-logo-fondo-oscuro.svg", width: 413, height: 97 },
} as const;

/** Logo de Divimesa, tal cual vienen los archivos de public/brand. */
export function DivimesaLogo({ variant = "horizontal", dark, className }: { variant?: keyof typeof LOGOS; dark?: boolean; className?: string }) {
  const l = LOGOS[variant];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={dark ? l.dark : l.light} alt="Divimesa" width={l.width} height={l.height} decoding="async" className={cn("h-6 w-auto", className)} />
  );
}

/** Pie discreto de las pantallas del cliente: "Pagos con" y el nombre de Divimesa. */
export function DivimesaFooter({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-center justify-center gap-1.5 pt-1 text-xs text-muted-foreground", className)}>
      Pagos con <DivimesaLogo variant="wordmark" className="h-6" />
    </p>
  );
}
