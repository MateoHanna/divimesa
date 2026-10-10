"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const SLUG_KEY = "divimesa-panel-codigo";

export function PinForm() {
  const router = useRouter();
  const slugRef = useRef<HTMLInputElement>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // El código del restaurante viene del enlace (?r=...) o de la última vez en este celular.
  useEffect(() => {
    try {
      const fromLink = new URLSearchParams(window.location.search).get("r");
      if (slugRef.current) slugRef.current.value = fromLink ?? window.localStorage.getItem(SLUG_KEY) ?? "";
    } catch { /* localStorage no disponible */ }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const slug = slugRef.current?.value ?? "";
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/panel/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, pin }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (json.ok) {
        try { window.localStorage.setItem(SLUG_KEY, slug.trim().toLowerCase()); } catch { /* sin localStorage */ }
        router.refresh();
        return;
      }
      setError(json.error ?? "No se pudo ingresar.");
      setPin("");
    } catch {
      setError("Sin conexión. Intente de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Panel del salonero</CardTitle>
          <CardDescription>Ingrese el código de su restaurante y su PIN.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="codigo" className="text-sm font-medium">Código del restaurante</label>
              <Input id="codigo" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                ref={slugRef} placeholder="Código" defaultValue="" className="h-12 text-lg" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="pin" className="text-sm font-medium">PIN</label>
              <Input id="pin" type="password" inputMode="numeric" autoComplete="current-password" autoFocus
                value={pin} onChange={(e) => setPin(e.target.value)}
                className="h-14 text-center text-2xl tracking-[0.5em]" aria-invalid={!!error} />
            </div>
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" size="xl" disabled={loading || pin.length === 0}>
              {loading ? "Verificando…" : "Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
