"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogOutIcon, MoreVerticalIcon, PrinterIcon, RotateCcwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import { ConfirmDialog } from "./confirm-dialog";
import { enableAudio } from "./sound";
import { TableDetail } from "./table-detail";
import { TableGrid } from "./table-grid";
import { useBackLayer } from "./use-back-layer";
import { usePanel } from "./use-panel";

export function PanelApp() {
  const router = useRouter();
  const onUnauthorized = useCallback(() => router.refresh(), [router]);
  const { state, notices, busy, act } = usePanel(onUnauthorized);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reset, setReset] = useState<null | "demo" | "factory">(null);

  // El navegador solo deja sonar el aviso después de un primer toque.
  useEffect(() => {
    window.addEventListener("pointerdown", enableAudio, { once: true });
    return () => window.removeEventListener("pointerdown", enableAudio);
  }, []);

  const selected = state?.tables.find((t) => t.id === selectedId) ?? null;
  // El botón de atrás del celular vuelve de la mesa a la grilla.
  useBackLayer(!!selected, () => setSelectedId(null));

  async function logout() {
    await fetch("/api/panel/logout", { method: "POST" });
    router.refresh();
  }

  return (
    <div className="min-h-dvh bg-muted/40" style={state ? ({ "--brand": state.restaurant.primaryColor } as React.CSSProperties) : undefined}>
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b bg-background px-4 py-3">
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold">{state?.restaurant.name ?? "Panel"}</h1>
        <span className="text-xs text-muted-foreground">Salonero</span>
        <Button variant="ghost" size="icon" aria-label="Menú" onClick={() => setMenuOpen(true)}><MoreVerticalIcon /></Button>
      </header>

      <div className="md:grid md:grid-cols-[minmax(0,1fr)_26rem] lg:grid-cols-[minmax(0,1fr)_30rem]">
        <main className="p-4">
          {!state ? (
            <p className="py-16 text-center text-muted-foreground">Cargando mesas…</p>
          ) : (
            <TableGrid tables={state.tables} selectedId={selectedId} onSelect={setSelectedId} />
          )}
        </main>

        {/* Celular: pantalla completa encima de la grilla. Tablet: columna lateral. */}
        <aside
          className={cn(
            "bg-background",
            selected ? "fixed inset-0 z-40 overflow-y-auto md:sticky md:top-[3.4rem] md:z-auto md:h-[calc(100dvh-3.4rem)] md:border-l" : "hidden md:block md:border-l",
          )}
        >
          {selected && state ? (
            <TableDetail key={selected.id} table={selected} menu={state.menu} busy={busy} act={act} onBack={() => setSelectedId(null)} />
          ) : (
            <p className="p-8 text-center text-muted-foreground">Elegí una mesa para ver su cuenta.</p>
          )}
        </aside>
      </div>

      <div className="pointer-events-none fixed inset-x-0 top-16 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {notices.map((n) => (
          <div key={n.id} role={n.kind === "error" ? "alert" : "status"}
            className={cn("pointer-events-auto w-full max-w-md rounded-xl px-4 py-3 text-sm font-medium shadow-lg",
              n.kind === "error" && "bg-destructive text-white",
              n.kind === "paid" && "bg-emerald-600 text-white",
              n.kind === "info" && "bg-foreground text-background")}>
            {n.text}
          </div>
        ))}
      </div>

      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent title="Menú del panel" description="Las dos opciones de reinicio piden confirmación.">
          <Button variant="outline" size="lg" asChild>
            <Link href="/panel/qr"><PrinterIcon /> Imprimir QR de todas las mesas</Link>
          </Button>
          <Button variant="outline" size="lg" onClick={() => { setMenuOpen(false); setReset("demo"); }}>
            <RotateCcwIcon /> Reiniciar demo
          </Button>
          <p className="-mt-2 text-sm text-muted-foreground">Borra cuentas y pagos y deja la Mesa 4 abierta. Conserva nombre, color y menú.</p>
          <Button variant="outline" size="lg" className="text-destructive" onClick={() => { setMenuOpen(false); setReset("factory"); }}>
            <RotateCcwIcon /> Restaurar valores de fábrica
          </Button>
          <p className="-mt-2 text-sm text-muted-foreground">Devuelve todo al estado original, incluido el menú, el nombre y el color.</p>
          <Button variant="ghost" size="lg" onClick={logout}><LogOutIcon /> Salir</Button>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={reset === "demo"} onOpenChange={(o) => !o && setReset(null)} busy={busy}
        title="¿Reiniciar la demo?" confirmLabel="Reiniciar demo"
        description="Se borran todas las cuentas y pagos, y la Mesa 4 vuelve a quedar abierta. El nombre, el color y el menú no cambian."
        onConfirm={async () => { setSelectedId(null); await act("/api/panel/demo/reset", "POST", undefined, "Demo reiniciada"); }} />
      <ConfirmDialog open={reset === "factory"} onOpenChange={(o) => !o && setReset(null)} destructive busy={busy}
        title="¿Restaurar valores de fábrica?" confirmLabel="Restaurar todo"
        description="Se pierden las cuentas, los pagos y también tus cambios al menú, al nombre y al color del restaurante."
        onConfirm={async () => { setSelectedId(null); await act("/api/panel/demo/factory-reset", "POST", undefined, "Valores de fábrica restaurados"); }} />
    </div>
  );
}
