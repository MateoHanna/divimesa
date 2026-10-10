"use client";

import { useEffect, useState } from "react";

import { DivimesaLogo } from "@/components/brand/divimesa-logo";
import { cn } from "@/lib/utils";

type Card = "intro" | "outro" | null;
interface Tap { id: number; x: number; y: number }

/** Lo que el script de grabación (scripts/demo-video) usa para dirigir la capa. */
export interface DemoVideoApi {
  ready: boolean;
  card: (c: Card) => void;
  caption: (text: string | null) => void;
  tap: (x: number, y: number) => void;
  /** Muestra u oculta la pantalla de "escaneando el QR" sobre el celular. */
  scan: (on: boolean) => void;
}

declare global {
  interface Window { __demoVideo?: DemoVideoApi }
}

/**
 * Capa del modo grabación: tarjeta de inicio y de cierre, texto de cada escena y el círculo
 * suave donde se "toca". No recibe clics (pointer-events-none), así que no estorba al recorrido.
 */
export function RecordingOverlay({ tall, onScan }: { tall: boolean; onScan: (on: boolean) => void }) {
  const [card, setCard] = useState<Card>("intro");
  const [caption, setCaption] = useState<string | null>(null);
  const [taps, setTaps] = useState<Tap[]>([]);

  useEffect(() => {
    let n = 0;
    const api: DemoVideoApi = {
      ready: true,
      card: setCard,
      caption: setCaption,
      tap: (x, y) => {
        const id = ++n;
        setTaps((t) => [...t.slice(-3), { id, x, y }]);
        window.setTimeout(() => setTaps((t) => t.filter((v) => v.id !== id)), 900);
      },
      scan: onScan,
    };
    window.__demoVideo = api;
    return () => { delete window.__demoVideo; };
  }, [onScan]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-40 overflow-hidden font-sans">
      {/* Texto de la escena */}
      <div className={cn("absolute inset-x-0 flex justify-center px-10", tall ? "top-[250px]" : "bottom-[52px]")}>
        {caption ? (
          <p key={caption} className={cn(
            "animate-caption-in rounded-[28px] bg-[#1C1C1E] px-9 py-5 text-center font-bold leading-tight text-white shadow-2xl",
            tall ? "max-w-[900px] text-[60px]" : "text-[52px]")}>
            {caption}
          </p>
        ) : null}
      </div>

      {/* Círculo del toque */}
      {taps.map((t) => (
        <span key={t.id} className="animate-tap-ring absolute size-[88px] rounded-full border-[5px] border-[#D91E18] bg-[#D91E18]/25"
          style={{ left: t.x - 44, top: t.y - 44 }} />
      ))}

      {/* Tarjeta de inicio */}
      <section className={cn("absolute inset-0 flex flex-col items-center justify-center gap-12 bg-white px-16 text-center transition-opacity duration-500",
        card === "intro" ? "opacity-100" : "opacity-0")}>
        <DivimesaLogo variant="wordmark" className={tall ? "h-20" : "h-24"} />
        <h1 className={cn("max-w-[1300px] font-extrabold leading-[1.05] tracking-[-0.03em] text-[#1C1C1E]", tall ? "text-[84px]" : "text-[96px]")}>
          ¿La mesa quiere pagar por separado?
        </h1>
      </section>

      {/* Tarjeta final */}
      <section className={cn("absolute inset-0 flex flex-col items-center justify-center gap-10 bg-[#1C1C1E] px-16 text-center text-white transition-opacity duration-500",
        card === "outro" ? "opacity-100" : "opacity-0")}>
        <DivimesaLogo variant="wordmark" dark className={tall ? "h-24" : "h-28"} />
        <p className={cn("font-extrabold tracking-[-0.02em] text-[#FF4A3D]", tall ? "text-[76px]" : "text-[88px]")}>divimesa.com</p>
        <p className={cn("font-semibold text-white/90", tall ? "text-[48px]" : "text-[52px]")}>WhatsApp +1 806 300 6454</p>
      </section>
    </div>
  );
}
