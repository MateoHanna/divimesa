"use client";

import { useRef, useState } from "react";
import { ImageIcon, Trash2Icon } from "lucide-react";

import { BrandMark } from "@/components/brand/brand-mark";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { brandVars, normalizeHex } from "@/lib/branding";
import type { PanelState } from "@/lib/panel/types";
import { cn } from "@/lib/utils";

import { prepareLogo } from "./logo-image";

type Act = (url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown, okText?: string) => Promise<boolean>;

const PRESETS = ["#D91E18", "#0f766e", "#15803d", "#1d4ed8", "#6d28d9", "#be185d", "#b91c1c", "#c2410c", "#a16207", "#111827"];

export function BrandingDialog({
  open, onOpenChange, restaurant, act, busy, onError,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  restaurant: PanelState["restaurant"] | undefined;
  act: Act;
  busy: boolean;
  onError: (message: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && restaurant ? <Form restaurant={restaurant} act={act} busy={busy} onClose={() => onOpenChange(false)} onError={onError} /> : null}
    </Dialog>
  );
}

function Form({
  restaurant, act, busy, onClose, onError,
}: { restaurant: PanelState["restaurant"]; act: Act; busy: boolean; onClose: () => void; onError: (m: string) => void }) {
  const [name, setName] = useState(restaurant.name);
  const [color, setColor] = useState(restaurant.primaryColor);
  const [hex, setHex] = useState(restaurant.primaryColor);
  const file = useRef<HTMLInputElement>(null);
  const valid = normalizeHex(color) !== null && name.trim().length > 0;

  function pickColor(c: string) {
    setColor(c);
    setHex(c);
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    try {
      const small = await prepareLogo(f);
      const form = new FormData();
      form.append("logo", small);
      await act("/api/panel/branding/logo", "POST", form, "Logo actualizado");
    } catch (e) {
      onError(e instanceof Error && e.message === "logo_too_big"
        ? "El logo pesa demasiado. Pruebe con una imagen más liviana."
        : "El logo tiene que ser PNG, JPG o WebP.");
    } finally {
      if (file.current) file.current.value = "";
    }
  }

  async function save() {
    const ok = await act("/api/panel/branding", "PATCH", { name: name.trim(), primaryColor: normalizeHex(color) }, "Datos del restaurante guardados");
    if (ok) onClose();
  }

  return (
    <DialogContent title="Personalizar restaurante" description="Así se ve el local de cada dueño en la demo: el nombre, el color y el logo.">
      <div className="overflow-hidden rounded-xl border" style={brandVars(color) as React.CSSProperties}>
        <div className="flex items-center gap-3 border-b-4 p-3" style={{ borderColor: "var(--brand)" }}>
          <BrandMark name={name || "R"} logoUrl={restaurant.logoUrl} />
          <div className="min-w-0">
            <p className="truncate font-bold">{name.trim() || "Nombre del restaurante"}</p>
            <p className="text-xs text-muted-foreground">Vista previa</p>
          </div>
          <span className="ml-auto rounded-lg px-3 py-1.5 text-sm font-semibold" style={{ background: "var(--brand)", color: "var(--primary-foreground)" }}>Pagar</span>
        </div>
      </div>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Nombre
        <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className="h-12 text-base" />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Color</legend>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((c) => (
            <button key={c} type="button" aria-label={`Color ${c}`} aria-pressed={normalizeHex(color) === c} onClick={() => pickColor(c)}
              className={cn("size-10 rounded-full border-2 border-white ring-1 ring-black/20", normalizeHex(color) === c && "ring-4 ring-primary/50")}
              style={{ background: c }} />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input type="color" aria-label="Elegir otro color" value={normalizeHex(color) ?? "#D91E18"} onChange={(e) => pickColor(e.target.value)}
            className="h-12 w-14 shrink-0 cursor-pointer rounded-lg border bg-transparent p-1" />
          <Input value={hex} aria-label="Color en formato #rrggbb" maxLength={7} className="h-12 font-mono text-base"
            onChange={(e) => { setHex(e.target.value); const n = normalizeHex(e.target.value); if (n) setColor(n); }} />
        </div>
        {normalizeHex(hex) === null ? <p role="alert" className="text-sm text-destructive">Escriba el color como #D91E18.</p> : null}
      </fieldset>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Logo</span>
        <div className="flex items-center gap-3">
          <BrandMark name={name || "R"} logoUrl={restaurant.logoUrl} className="size-16" />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => file.current?.click()}>
              <ImageIcon /> {restaurant.logoUrl ? "Cambiar logo" : "Subir logo"}
            </Button>
            {restaurant.logoUrl ? (
              <Button type="button" variant="ghost" disabled={busy} onClick={() => act("/api/panel/branding/logo", "DELETE", undefined, "Logo quitado")}>
                <Trash2Icon /> Quitar
              </Button>
            ) : null}
          </div>
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Archivo del logo"
            onChange={(e) => void onFile(e.target.files?.[0])} />
        </div>
        <p className="text-xs text-muted-foreground">PNG, JPG o WebP. Se reduce solo para que cargue rápido.</p>
      </div>

      <Button size="xl" disabled={busy || !valid} onClick={save}>Guardar</Button>
      <Button size="lg" variant="outline" onClick={onClose}>Cerrar</Button>
    </DialogContent>
  );
}
