import { initialOf } from "@/lib/branding";
import { cn } from "@/lib/utils";

/** Logo del restaurante o, si no tiene, su inicial sobre el color de la marca. */
export function BrandMark({ name, logoUrl, className }: { name: string; logoUrl: string | null; className?: string }) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt={`Logo de ${name}`} width={48} height={48} decoding="async"
        className={cn("size-12 shrink-0 rounded-xl bg-white object-contain p-0.5 ring-1 ring-black/10", className)} />
    );
  }
  return (
    <span aria-hidden className={cn("flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-xl font-bold text-primary-foreground", className)}>
      {initialOf(name)}
    </span>
  );
}
