import Link from "next/link";

import { cn } from "@/lib/utils";

const LOGOS = {
  // Ícono y nombre.
  horizontal: { light: "/brand/divimesa-horizontal.svg", dark: "/brand/divimesa-horizontal-fondo-oscuro.svg", width: 439, height: 96 },
  // Solo el nombre.
  wordmark: { light: "/brand/divimesa-logo.svg", dark: "/brand/divimesa-logo-fondo-oscuro.svg", width: 413, height: 97 },
} as const;

/** Logo de Divimesa, tal cual vienen los archivos de public/brand. */
export function DivimesaLogo({ variant = "horizontal", dark, className, style }: { variant?: keyof typeof LOGOS; dark?: boolean; className?: string; style?: React.CSSProperties }) {
  const l = LOGOS[variant];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={dark ? l.dark : l.light} alt="Divimesa" width={l.width} height={l.height} decoding="async" className={cn("h-6 w-auto", className)} style={style} />
  );
}

/** Pie discreto de las pantallas del cliente: "Pagos con" y el nombre de Divimesa, y el enlace a la política de privacidad. */
export function DivimesaFooter({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-0.5 pt-1 text-xs text-muted-foreground", className)}>
      <p className="flex items-center justify-center gap-1.5">
        Pagos con <DivimesaLogo variant="wordmark" className="h-6" />
      </p>
      <Link href="/privacidad" target="_blank" className="py-2 underline underline-offset-2">Privacidad</Link>
    </div>
  );
}
