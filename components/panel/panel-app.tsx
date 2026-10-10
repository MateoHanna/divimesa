"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CircleCheckIcon, LogOutIcon, MoreVerticalIcon, PaletteIcon, PrinterIcon, RotateCcwIcon, WifiOffIcon } from "lucide-react";

import { BrandMark } from "@/components/brand/brand-mark";
import { DivimesaLogo } from "@/components/brand/divimesa-logo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { brandVars } from "@/lib/branding";
import { cn } from "@/lib/utils";

import { BrandingDialog } from "./branding-dialog";
import { ConfirmDialog } from "./confirm-dialog";
import { enableAudio } from "./sound";
import { TableDetail } from "./table-detail";
import { TableGrid } from "./table-grid";
import { useBackLayer } from "./use-back-layer";
import { usePanel } from "./use-panel";

export function PanelApp() {
  const router = useRouter();
  const onUnauthorized = useCallback(() => router.refresh(), [router]);
  const { state, notices, flashing, busy, offline, act, refresh, dismiss, notify } = usePanel(onUnauthorized);
  const [branding, setBranding] = useState(false);
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
    <div className="min-h-dvh bg-muted/40" style={state ? (brandVars(state.restaurant.primaryColor) as React.CSSProperties) : undefined}>
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-background px-4 py-3">
        {state ? <BrandMark name={state.restaurant.name} logoUrl={state.restaurant.logoUrl} className="size-10 rounded-lg text-lg" /> : null}
        <div className="flex min-w-0 flex-1 items-center gap-x-3 gap-y-0.5 max-sm:flex-col max-sm:items-start">
          <h1 className="min-w-0 max-w-full truncate text-2xl leading-tight font-extrabold tracking-tight">{state?.restaurant.name ?? "Panel"}</h1>
          <DivimesaLogo className="h-5 shrink-0" />
        </div>
        <Button variant="ghost" size="icon" aria-label="Menú" onClick={() => setMenuOpen(true)}><MoreVerticalIcon /></Button>
      </header>

      {offline && state ? (
        <p role="status" className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-950">
          <WifiOffIcon className="size-4" /> Sin conexión. Reintentando… los datos pueden estar desactualizados.
        </p>
      ) : null}

      <div className="md:grid md:grid-cols-[minmax(0,1fr)_26rem] lg:grid-cols-[minmax(0,1fr)_30rem]">
        <main className="p-4">
          {!state && offline ? (
            <div role="alert" className="mx-auto mt-10 flex max-w-sm flex-col items-center gap-3 rounded-2xl border bg-card p-6 text-center">
              <WifiOffIcon className="size-8 text-muted-foreground" aria-hidden />
              <p className="font-semibold">No se pudieron cargar las mesas</p>
              <p className="text-sm text-muted-foreground">Revise el internet. Se reintenta solo cada pocos segundos.</p>
              <Button onClick={() => void refresh()}>Reintentar ahora</Button>
            </div>
          ) : !state ? (
            <div aria-busy="true" aria-label="Cargando mesas">
              <div className="mb-3 h-5 w-64 animate-pulse rounded bg-muted" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 8 }, (_, i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-muted" />)}
              </div>
            </div>
          ) : (
            <TableGrid tables={state.tables} selectedId={selectedId} onSelect={setSelectedId} flashing={flashing} />
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
            className={cn("animate-notice-in pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold shadow-xl",
              n.kind === "error" && "bg-destructive text-white",
              n.kind === "paid" && "bg-emerald-600 text-white ring-2 ring-white/70",
              n.kind === "payment" && "bg-sky-700 text-white",
              n.kind === "info" && "bg-foreground text-background")}>
            <button type="button" className="min-w-0 flex-1 text-left"
              aria-label={n.sticky ? `${n.text}. Tocar para cerrar el aviso` : n.text}
              onClick={() => dismiss(n.id)}>
              {n.kind === "paid" ? <CircleCheckIcon className="mr-1.5 -mt-0.5 inline size-5" aria-hidden /> : null}
              {n.text}
            </button>
            {n.kind === "paid" && n.billId ? (
              <Button size="sm" variant="secondary" className="shrink-0 bg-white font-bold text-emerald-800 hover:bg-white/90" disabled={busy}
                onClick={async () => {
                  const ok = await act(`/api/panel/bills/${n.billId}/release`, "POST", undefined, `Mesa liberada`);
                  if (ok) dismiss(n.id);
                }}>
                Liberar mesa
              </Button>
            ) : null}
          </div>
        ))}
      </div>

      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent title="Menú del panel" description="Las opciones de reinicio piden confirmación.">
          <Button variant="outline" size="lg" onClick={() => { setMenuOpen(false); setBranding(true); }}>
            <PaletteIcon /> Personalizar restaurante
          </Button>
          <button type="button" role="switch" aria-checked={!!state?.restaurant.showDeclineDemo} disabled={busy || !state}
            onClick={() => act("/api/panel/settings", "PATCH", { showDeclineDemo: !state?.restaurant.showDeclineDemo },
              state?.restaurant.showDeclineDemo ? "Simular rechazo apagado" : "Simular rechazo encendido")}
            className="flex min-h-16 items-center justify-between gap-3 rounded-xl border px-4 py-2 text-left disabled:opacity-50">
            <span>
              <span className="block font-medium">{"Mostrar 'Simular rechazo' en el checkout"}</span>
              <span className="block text-sm text-muted-foreground">Para demos. Apagado por defecto.</span>
            </span>
            <span aria-hidden className={cn("flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors",
              state?.restaurant.showDeclineDemo ? "bg-primary" : "bg-muted-foreground/30")}>
              <span className={cn("size-6 rounded-full bg-white shadow transition-transform", state?.restaurant.showDeclineDemo && "translate-x-5")} />
            </span>
          </button>
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

      <BrandingDialog open={branding} onOpenChange={setBranding} restaurant={state?.restaurant} act={act} busy={busy}
        onError={(m) => notify("error", m)} />

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
