"use client";

import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

import { DivimesaLogo } from "@/components/brand/divimesa-logo";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

export type Scene = "intro" | "cuenta" | "paga" | "panel" | "resto" | "restoPanel" | "cierre" | "contacto";
type Product = "phone" | "panel" | null;
interface Tap { id: number; x: number; y: number }

/** Lo que el script de grabación (scripts/demo-video) usa para dirigir la escena. */
export interface DemoVideoApi {
  ready: boolean;
  /** Cambia de escena (fundido de 0,4 s). */
  scene: (s: Scene) => void;
  /** Círculo suave donde se "toca" (coordenadas de la página). */
  tap: (x: number, y: number) => void;
  /** Pantalla de "escaneando el QR" sobre el celular. */
  scan: (on: boolean) => void;
  /** El celular entra inclinado y se endereza; siempre recto mientras se toca. */
  tilt: (on: boolean) => void;
  /** Zoom suave hacia el celular (1 = normal). */
  phoneZoom: (z: number) => void;
  /** Congela el movimiento lento de cámara (para dejar la imagen quieta). */
  hold: (on: boolean) => void;
  /** Cámara del panel: lleva el punto (x, y) del panel a la vista con ese zoom. null = panel completo. */
  panelCam: (x: number, y: number, zoom: number) => void;
}

declare global {
  interface Window { __demoVideo?: DemoVideoApi }
}

const INK = "#1C1C1E";
const CREAM = "#F7F4EF";

const SCENES: Record<Scene, { bg: string; layout: "center" | "side" | "top"; title: string; sub?: string; product: Product }> = {
  intro: { bg: BRAND.scarlet, layout: "center", title: "¿La mesa quiere pagar por separado?", product: null },
  cuenta: { bg: CREAM, layout: "side", title: "Escanean el QR.", sub: "La cuenta aparece al instante, sin descargar nada", product: "phone" },
  paga: { bg: CREAM, layout: "side", title: "Cada quien paga lo suyo.", sub: "Toda la cuenta, sus platos o partes iguales", product: "phone" },
  panel: { bg: CREAM, layout: "top", title: "Usted lo ve al instante.", product: "panel" },
  resto: { bg: CREAM, layout: "side", title: "Partes iguales, en segundos.", product: "phone" },
  restoPanel: { bg: CREAM, layout: "top", title: "Partes iguales, en segundos.", product: "panel" },
  cierre: { bg: BRAND.scarlet, layout: "center", title: "Sin app y sin equipo nuevo. El datáfono sigue igual.", product: null },
  contacto: { bg: BRAND.scarlet, layout: "center", title: "", product: null },
};

/** Medidas de cada formato. El celular mide 410x820 y el panel se dibuja a su tamaño natural y se escala. */
const WIDE = {
  w: 1920, h: 1080,
  phone: { cx: 1440, cy: 540, scale: 1.12 },
  card: { left: 120, top: 250, w: 1680, h: 780, natW: 1400, natH: 650 },
  title: 108, introTitle: 120, sub: 42,
};
const TALL = {
  w: 1080, h: 1920,
  phone: { cx: 540, cy: 1310, scale: 1.34 },
  card: { left: 60, top: 700, w: 960, h: 800, natW: 900, natH: 750 },
  title: 96, introTitle: 100, sub: 44,
};

/**
 * Escenario del video automático (scripts/demo-video): una puesta en escena de anuncio con
 * fondo, titulares y el producto real (los iframes del celular y del panel, nunca una maqueta).
 * Los iframes se montan una sola vez y solo se mueven con CSS, así no se recargan entre escenas.
 */
export function RecordingStage({ token, mesa, tall }: { token: string | undefined; mesa: number; tall: boolean }) {
  const D = tall ? TALL : WIDE;
  const [scene, setScene] = useState<Scene>("intro");
  const [leaving, setLeaving] = useState<Scene | null>(null);
  const [scan, setScan] = useState(false);
  const [tilted, setTilted] = useState(true);
  const [phoneZoom, setPhoneZoom] = useState(1);
  const [cam, setCam] = useState<{ x: number; y: number; zoom: number } | null>(null);
  const [held, setHeld] = useState(false);
  const [taps, setTaps] = useState<Tap[]>([]);
  const current = useRef<Scene>("intro");
  const phoneGroup = useRef<HTMLDivElement>(null);
  const panelGroup = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let n = 0;
    /** Movimiento lento de cámara 1,0 a 1,06 que arranca cuando el producto entra en escena. */
    const drift = (el: HTMLElement | null, ms: number) => {
      if (!el) return;
      el.getAnimations().forEach((a) => a.cancel());
      el.animate([{ transform: "scale(1)" }, { transform: "scale(1.06)" }], { duration: ms, easing: "linear", fill: "forwards" });
    };
    const api: DemoVideoApi = {
      ready: true,
      scene: (next) => {
        const old = current.current;
        if (next === old) return;
        current.current = next;
        setLeaving(old);
        setScene(next);
        window.setTimeout(() => setLeaving((l) => (l === old ? null : l)), 480);
        const was = SCENES[old].product;
        const now = SCENES[next].product;
        if (now !== was) {
          if (now === "phone") drift(phoneGroup.current, 17000);
          if (now === "panel") drift(panelGroup.current, 9000);
        }
        if (now === "panel") setCam(null);
      },
      tap: (x, y) => {
        const id = ++n;
        setTaps((t) => [...t.slice(-3), { id, x, y }]);
        window.setTimeout(() => setTaps((t) => t.filter((v) => v.id !== id)), 900);
      },
      scan: setScan,
      tilt: setTilted,
      phoneZoom: setPhoneZoom,
      hold: (on) => {
        setHeld(on);
        for (const el of [phoneGroup.current, panelGroup.current]) el?.getAnimations().forEach((a) => (on ? a.pause() : a.play()));
      },
      panelCam: (x, y, zoom) => setCam(zoom > 1 ? { x, y, zoom } : null),
    };
    window.__demoVideo = api;
    return () => { delete window.__demoVideo; };
  }, []);

  const product = SCENES[scene].product;
  const url = token ? `${BRAND.site}/m/${token}` : "";

  // Cámara del panel: lleva el punto pedido hacia el centro de la tarjeta sin dejar bordes vacíos.
  const baseScale = D.card.w / D.card.natW;
  const s = baseScale * (cam?.zoom ?? 1);
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const tx = cam ? clamp(D.card.w * 0.5 - cam.x * s, D.card.w - D.card.natW * s, 0) : 0;
  const ty = cam ? clamp(D.card.h * 0.42 - cam.y * s, D.card.h - D.card.natH * s, 0) : 0;

  const shown = leaving && leaving !== scene ? [leaving, scene] : [scene];

  return (
    <div className={cn("fixed inset-0 overflow-hidden font-sans transition-colors duration-[400ms]", held && "recording-held")} style={{ backgroundColor: SCENES[scene].bg }}>
      {/* Celular real */}
      <div ref={phoneGroup} aria-hidden={product !== "phone"} className="pointer-events-none absolute inset-0"
        style={{ transformOrigin: `${D.phone.cx}px ${D.phone.cy}px` }}>
        <div className={cn("absolute transition-[opacity,translate] duration-[400ms] ease-out", product === "phone" ? "pointer-events-auto opacity-100" : "translate-x-10 opacity-0")}
          style={{ left: D.phone.cx - 205, top: D.phone.cy - 410, width: 410, height: 820 }}>
          <div className="relative size-full rounded-[3.2rem] border-[10px] border-slate-900 bg-slate-900 shadow-[0_50px_90px_-20px_rgba(28,28,30,0.5)] transition-transform duration-[900ms] ease-in-out"
            style={{ transform: `scale(${D.phone.scale * phoneZoom}) rotate(${tilted ? 3 : 0}deg)` }}>
            <div aria-hidden className="absolute top-2 left-1/2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-slate-900" />
            {token ? (
              <iframe key={token} title={`Página del cliente, Mesa ${mesa}`} src={`/m/${token}?grabar=1`} className="size-full rounded-[2.5rem] bg-white" />
            ) : null}
            {scan ? (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 rounded-[2.5rem] bg-[#111]">
                <div className="relative flex size-[250px] items-center justify-center rounded-3xl bg-white p-5">
                  {url ? <QRCodeSVG value={url} size={210} /> : null}
                  <span aria-hidden className="animate-scan-line absolute top-[18px] right-3 left-3 h-1 rounded-full bg-[#D91E18] shadow-[0_0_14px_#D91E18]" />
                </div>
                <p className="text-xl font-semibold text-white/90">Mesa {mesa}</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Panel real en una tarjeta grande */}
      <div ref={panelGroup} aria-hidden={product !== "panel"} className="pointer-events-none absolute inset-0"
        style={{ transformOrigin: `${D.card.left + D.card.w / 2}px ${D.card.top + D.card.h / 2}px` }}>
        <div className={cn("absolute overflow-hidden rounded-[2rem] bg-white shadow-[0_40px_80px_-24px_rgba(28,28,30,0.45)] ring-1 ring-black/5 transition-[opacity,translate] duration-[400ms] ease-out",
          product === "panel" ? "pointer-events-auto opacity-100" : "translate-y-10 opacity-0")}
          style={{ left: D.card.left, top: D.card.top, width: D.card.w, height: D.card.h }}>
          <div className="origin-top-left transition-transform duration-[1100ms] ease-in-out"
            style={{ width: D.card.natW, height: D.card.natH, transform: `translate(${tx}px, ${ty}px) scale(${s})` }}>
            <iframe title="Panel del salonero" src="/panel" className="size-full" />
          </div>
        </div>
      </div>

      {/* Titulares */}
      {shown.map((name) => (
        <SceneText key={name} name={name} active={name === scene} tall={tall} />
      ))}

      {/* Círculo del toque */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-40">
        {taps.map((t) => (
          <span key={t.id} className="animate-tap-ring absolute size-[88px] rounded-full border-[5px] border-[#D91E18] bg-[#D91E18]/25"
            style={{ left: t.x - 44, top: t.y - 44 }} />
        ))}
      </div>
    </div>
  );
}

function SceneText({ name, active, tall }: { name: Scene; active: boolean; tall: boolean }) {
  const def = SCENES[name];
  const D = tall ? TALL : WIDE;
  const onRed = def.bg === BRAND.scarlet;
  const color = onRed ? "#FFFFFF" : INK;
  const white = { filter: "brightness(0) invert(1)" } as const;

  const place =
    def.layout === "side"
      ? tall ? "left-[70px] right-[70px] top-[110px]" : "left-[130px] top-0 h-full w-[900px] justify-center"
      : def.layout === "top"
        ? tall ? "left-[70px] right-[70px] top-[110px]" : "left-[120px] right-[120px] top-[70px]"
        : "inset-0 items-center justify-center px-[120px] text-center";

  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0", active ? "animate-scene-in" : "animate-scene-out")}>
      <div className="animate-text-drift absolute inset-0">
        <div className={cn("absolute flex flex-col", place)} style={{ color }}>
          {name === "intro" ? <DivimesaLogo variant="wordmark" className={cn("absolute left-1/2 -translate-x-1/2", tall ? "top-[150px] h-24" : "top-[90px] h-24")} style={white} /> : null}
          {name === "contacto" ? (
            <>
              <DivimesaLogo variant="wordmark" className={tall ? "h-32" : "h-36"} style={white} />
              <p className="mt-14 font-extrabold tracking-[-0.03em]" style={{ fontSize: tall ? 120 : 140, lineHeight: 1 }}>divimesa.com</p>
              <p className="mt-10 font-semibold opacity-90" style={{ fontSize: tall ? 52 : 60 }}>WhatsApp +1 806 300 6454</p>
            </>
          ) : name === "cierre" ? (
            <h1 className="font-extrabold tracking-[-0.03em]" style={{ fontSize: D.title, lineHeight: 1.04, textWrap: "balance" }}>
              Sin app y sin equipo nuevo.<br /><span className="opacity-90">El datáfono sigue igual.</span>
            </h1>
          ) : (
            <>
              <h1 className={cn("font-extrabold tracking-[-0.03em]", name === "intro" && "max-w-[1500px]")}
                style={{ fontSize: name === "intro" ? D.introTitle : D.title, lineHeight: 1.03, textWrap: "balance" }}>
                {def.title}
              </h1>
              {def.sub ? <p className="mt-8 font-medium" style={{ fontSize: D.sub, lineHeight: 1.25, color: "rgba(28,28,30,0.72)", maxWidth: tall ? 900 : 760 }}>{def.sub}</p> : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
