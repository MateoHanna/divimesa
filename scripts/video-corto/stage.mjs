// El escenario del video: una sola página que muestra el panel real y el celular real (iframes de la app),
// y encima los textos, la cámara (zoom) y los círculos de toque. Nada de esto es parte de la app:
// la página se sirve solo mientras se graba (ver index.mjs).

import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";

/** Tamaño de la página en píxeles CSS; con deviceScaleFactor 1,5 salen 1920x1080 y 1080x1920. */
export const SIZES = {
  horizontal: { w: 1280, h: 720, out: [1920, 1080], dsf: 1.5 },
  vertical: { w: 540, h: 960, out: [1080, 1920], dsf: 2 },
};

const INK = "#1C1C1E";
const CREAM = "#F7F4EF";
const SCARLET = "#D91E18";

export function stageHtml({ view, root, token, siteUrl }) {
  const { w: W, h: H } = SIZES[view];
  const tall = view === "vertical";
  const font = fs.readFileSync(path.join(root, "app/fonts/outfit-latin-wght.woff2")).toString("base64");
  const logo = fs.readFileSync(path.join(root, "public/brand/divimesa-logo.svg")).toString("base64");
  const qr = renderToStaticMarkup(createElement(QRCodeSVG, { value: `${siteUrl}/m/${token}`, size: 190, level: "H" }));

  // Medidas por formato (px CSS).
  const phoneScale = tall ? 0.86 : 0.74;
  const phoneW = 410, phoneH = 864;
  const phoneLeft = tall ? (W - phoneW * phoneScale) / 2 : W * 0.64;
  const phoneTop = tall ? 22 : (H - phoneH * phoneScale) / 2;

  return `<!doctype html><html lang="es-CR"><head><meta charset="utf-8"><title>video</title>
<style>
@font-face{font-family:Outfit;src:url(data:font/woff2;base64,${font}) format("woff2");font-weight:100 900}
*{box-sizing:border-box}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:${CREAM};font-family:Outfit,system-ui,sans-serif;color:${INK}}
.layer{position:absolute;inset:0;visibility:hidden}
.layer.on{visibility:visible}
#cam{position:absolute;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0}
#drift{position:absolute;inset:0;transform-origin:50% 45%}
#panel{border:0;width:${W}px;height:${H}px;background:#fff;display:block}
#spot{position:absolute;display:none;border-radius:20px;outline:5px solid #fff;box-shadow:0 0 0 4000px rgba(28,28,30,.52);animation:throb 1s ease-in-out infinite}
@keyframes throb{50%{outline-color:${SCARLET};outline-width:7px}}
#chip{position:absolute;display:none;background:${SCARLET};color:#fff;font-weight:800;font-size:${tall ? 22 : 26}px;padding:6px 14px;border-radius:999px;box-shadow:0 8px 24px rgba(0,0,0,.35);animation:pop .22s ease-out}
@keyframes pop{from{transform:scale(.4);opacity:0}to{transform:none;opacity:1}}
/* celular */
#phoneDrift{position:absolute;inset:0;transform-origin:50% 50%}
#phoneBox{position:absolute;left:${phoneLeft}px;top:${phoneTop}px;width:${phoneW}px;height:${phoneH}px;transform-origin:0 0;transform:scale(${phoneScale})}
#phoneFrame{position:relative;width:100%;height:100%;border:10px solid #0f172a;border-radius:52px;background:#0f172a;box-shadow:0 40px 70px -20px rgba(28,28,30,.55);overflow:hidden}
#phone{border:0;width:390px;height:844px;display:block;background:#fff;border-radius:42px}
#scan{position:absolute;inset:0;display:none;background:#111;flex-direction:column;align-items:center;justify-content:center;gap:22px;color:#fff;font-size:22px;font-weight:600}
#scan.on{display:flex}
#qrBox{position:relative;background:#fff;border-radius:24px;padding:22px;width:236px;height:236px}
#qrBox svg{display:block}
#line{position:absolute;left:12px;right:12px;top:14px;height:5px;border-radius:5px;background:${SCARLET};box-shadow:0 0 14px ${SCARLET};animation:scan .9s ease-in-out infinite}
@keyframes scan{0%,100%{transform:translateY(0)}50%{transform:translateY(200px)}}
/* texto */
#cap{position:absolute;display:none;z-index:20;font-weight:800;letter-spacing:-.02em;line-height:1.08}
#cap.band{display:block;left:24px;right:24px;bottom:${tall ? 28 : 28}px;background:${INK};color:#fff;border-radius:20px;padding:${tall ? "20px 22px" : "16px 28px"};font-size:${tall ? 40 : 40}px;text-align:center;box-shadow:0 14px 40px rgba(0,0,0,.3)}
#cap.side{display:block;left:70px;top:0;height:100%;width:${W * 0.5}px;display:flex;align-items:center;font-size:64px;color:${INK}}
#cap.pop{animation:pop .12s ease-out}
/* toques */
#rings{position:absolute;inset:0;z-index:30;pointer-events:none}
.ring{position:absolute;width:76px;height:76px;margin:-38px 0 0 -38px;border-radius:50%;border:5px solid ${SCARLET};background:rgba(217,30,24,.25);animation:ring .55s ease-out both}
@keyframes ring{0%{opacity:0;transform:scale(.4)}30%{opacity:1}100%{opacity:0;transform:scale(1.35)}}
/* cierre */
#end{background:${SCARLET};color:#fff;text-align:center}
#end .in{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${tall ? 26 : 22}px;padding:0 40px}
#end img{height:${tall ? 58 : 72}px;filter:brightness(0) invert(1)}
#end .l{opacity:0;font-weight:800;letter-spacing:-.03em;line-height:1.04}
#end .l.on{opacity:1;animation:pop .14s ease-out}
#end .l1{font-size:${tall ? 52 : 60}px;text-wrap:balance}
#end .l2{font-size:${tall ? 52 : 60}px;opacity:0}
#end .l3{font-size:${tall ? 74 : 92}px}
#end .l4{font-size:${tall ? 20 : 24}px;font-weight:500;opacity:0;line-height:1.25;max-width:${tall ? 460 : 760}px;position:absolute;bottom:${tall ? 60 : 46}px}
#end .l4.on{opacity:.82}
</style></head><body>
<div id="panelLayer" class="layer"><div id="cam"><div id="drift"><iframe id="panel" src="/panel"></iframe><div id="spot"></div><div id="chip"></div></div></div></div>
<div id="phoneLayer" class="layer" style="background:${CREAM}"><div id="phoneDrift"><div id="phoneBox"><div id="phoneFrame"><iframe id="phone" src="/m/${token}?grabar=1"></iframe><div id="scan"><div id="qrBox">${qr}<div id="line"></div></div><div>Mesa 4</div></div></div></div></div></div>
<div id="end" class="layer"><div class="in">
  <img src="data:image/svg+xml;base64,${logo}" alt="">
  <div class="l l1">Piloto gratis de 2 semanas.</div>
  <div class="l l2">Sin instalación.</div>
  <div class="l l3">divimesa.com</div>
  <div class="l l4">En el piloto, pagos por SINPE Móvil.<br>Tarjeta y Apple Pay, próximamente.</div>
</div></div>
<div id="cap"></div><div id="rings"></div>
<script>
const $ = (id) => document.getElementById(id);
window.V = {
  ready: true,
  /** 'panel' | 'phone' | 'end' */
  show(name) { for (const [n, id] of [["panel", "panelLayer"], ["phone", "phoneLayer"], ["end", "end"]]) $(id).classList.toggle("on", n === name); },
  /** Texto abajo ('band') o a la izquierda ('side'); null lo quita. De golpe, sin fundido. */
  cap(text, mode = "band") {
    const c = $("cap");
    if (!text) { c.className = ""; c.innerHTML = ""; return; }
    c.className = mode; c.innerHTML = text.replace(/\\n/g, "<br>");
    void c.offsetWidth; c.classList.add("pop");
  },
  /** Cámara: lleva el punto (px, py) de la página al punto (tx, ty) de la pantalla con zoom k. ms = 0 es un corte. */
  cam(px, py, k, tx, ty, ms = 0) {
    const el = $("cam");
    el.style.transition = ms ? "transform " + ms + "ms cubic-bezier(.3,.1,.2,1)" : "none";
    el.style.transform = "translate(" + (tx - k * px) + "px," + (ty - k * py) + "px) scale(" + k + ")";
  },
  /** Movimiento lento de cámara (para que ninguna imagen quede quieta). */
  drift(from, to, s) {
    const d = $("drift"); d.getAnimations().forEach((a) => a.cancel());
    d.animate([{ transform: "scale(" + from + ")" }, { transform: "scale(" + to + ")" }], { duration: s * 1000, easing: "linear", fill: "forwards" });
  },
  phoneDrift(from, to, s) { const d = $("phoneDrift"); d.getAnimations().forEach((a) => a.cancel()); d.animate([{ transform: "scale(" + from + ")" }, { transform: "scale(" + to + ")" }], { duration: s * 1000, easing: "linear", fill: "forwards" }); },
  spot(r) { const s = $("spot"); if (!r) { s.style.display = "none"; return; } Object.assign(s.style, { display: "block", left: r.x - 8 + "px", top: r.y - 8 + "px", width: r.w + 16 + "px", height: r.h + 16 + "px" }); },
  chip(r, text) { const c = $("chip"); if (!r) { c.style.display = "none"; return; } c.textContent = text; c.style.display = "block"; c.style.animation = "none"; void c.offsetWidth; c.style.animation = ""; c.style.left = r.x + "px"; c.style.top = r.y + "px"; },
  ring(x, y) { const e = document.createElement("div"); e.className = "ring"; e.style.left = x + "px"; e.style.top = y + "px"; $("rings").appendChild(e); setTimeout(() => e.remove(), 700); },
  scan(on) { $("scan").classList.toggle("on", on); },
  end(n) { for (const c of ["l1", "l2", "l3", "l4"]) { const e = document.querySelector("#end ." + c); e.classList.toggle("on", Number(c[1]) <= n); } },
};
</script></body></html>`;
}
