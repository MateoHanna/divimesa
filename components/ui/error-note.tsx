import { TriangleAlertIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Mensaje de error en ámbar con ícono: no usa el rojo, que es el color de la marca. */
export function ErrorNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p role="alert" className={cn("flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950", className)}>
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden /> <span>{children}</span>
    </p>
  );
}
