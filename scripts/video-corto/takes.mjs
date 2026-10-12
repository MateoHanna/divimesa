// Las 4 tomas del video. Cada una se graba en tiempo real con la app funcionando de verdad, y `at(t)` espera
// al segundo t de la toma. Los tiempos son los del guion (0-9 s, 9-17 s, 17-27 s y 27-30 s del video final).

import { liberarMesa, marcarPagadaQR, revelarPago } from "./fixture.mjs";

export const DURACION = { a: 9, b: 8, c: 10, d: 3 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// El primero es el SINPE «por confirmar» que el salonero recibe; los otros cinco entran como líneas de la lista de pagos.
export const METODOS = ["sinpe", "apple_pay", "sinpe", "card", "apple_pay", "card"];
export const TEXTO = {
  llenas: "Viernes, 9 p.m.\nTodas las mesas llenas.",
  mesa4: "La mesa 4 quiere\npagar por separado.",
  celular: "Cada quien paga\nsu parte desde\nel celular.",
  celularLado: "Cada quien paga\nsu parte desde\nel celular.",
  libre: "La mesa queda libre\nsin pasar el datáfono.",
  atiende: "Su salonero\nvuelve a atender.",
};

export function entorno(page, view, size, log) {
  const tall = view === "vertical";
  const BAND = tall ? 190 : 120;
  const call = (fn, ...args) => page.evaluate(({ fn, args }) => window.V[fn](...args), { fn, args });
  const frame = (re) => page.frames().find((f) => re.test(f.url()));
  let t0 = 0;
  const now = () => Date.now() / 1000 - t0;
  return {
    page, tall, BAND, size, call, log, frame,
    start(t) { t0 = t; },
    now,
    /** Espera al segundo `t` de la toma; si ya pasó, sigue y avisa. */
    async at(t, nombre) {
      const wait = t - now();
      if (wait > 0) await sleep(wait * 1000);
      const late = now() - t;
      log(`    ${now().toFixed(2).padStart(5)} s  ${nombre ?? ""}${late > 0.15 ? `  (${late.toFixed(2)} s tarde)` : ""}`);
    },
    /** Cámara: encuadra el rectángulo (en coordenadas de la página) con el zoom que quepa, centrado sobre el texto. */
    /** Argumentos de `cam` para encuadrar un rectángulo (coordenadas de la página). */
    focusArgs(rect, { k, margin = 0.9, force = false } = {}) {
      const availH = size.h - BAND;
      const fit = Math.min((size.w * margin) / rect.w, (availH * margin) / rect.h);
      const z = force && k ? k : Math.max(1, Math.min(k ?? fit, fit));
      const px = rect.x + rect.w / 2, py = rect.y + rect.h / 2;
      const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
      const tx = clamp(size.w / 2 - z * px, size.w - z * size.w, 0) + z * px;
      const ty = clamp(availH / 2 - z * py, size.h - z * size.h, 0) + z * py;
      return [px, py, z, tx, ty];
    },
    async focus(rect, { ms = 0, ...o } = {}) {
      const a = this.focusArgs(rect, o);
      await call("cam", ...a, ms);
      return a[2];
    },
    async tap(locator, { scroll = true } = {}) {
      if (scroll) await locator.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" })).catch(() => undefined);
      const box = await locator.boundingBox();
      if (box) await call("ring", box.x + box.width / 2, box.y + box.height / 2);
      await locator.click({ timeout: 8000 });
    },
  };
}

const union = (rs) => {
  const x = Math.min(...rs.map((r) => r.x)), y = Math.min(...rs.map((r) => r.y));
  return { x, y, w: Math.max(...rs.map((r) => r.x + r.width)) - x, h: Math.max(...rs.map((r) => r.y + r.height)) - y };
};
const asRect = (b) => ({ x: b.x, y: b.y, w: b.width, h: b.height });

/** Toma A (0 a 9 s): el panel con las 8 mesas abiertas y, desde el segundo 5, el acercamiento a la mesa 4. */
export async function tomaA(E) {
  const { call, at, tall } = E;
  const panel = E.frame(/\/panel/);
  const card = (n) => panel.getByRole("button", { name: new RegExp(`^Mesa ${n},`) });
  const boxes = {};
  for (let n = 1; n <= 8; n++) boxes[n] = await card(n).boundingBox();
  const r1 = union([1, 2, 3].map((n) => boxes[n])), r2 = union([4, 5, 6, 7, 8].map((n) => boxes[n]));
  const r4 = asRect(boxes[4]);

  await at(0, "panel completo");
  await call("show", "panel");
  await call("drift", 1, 1.04, 1.6);
  await call("cap", TEXTO.llenas);
  if (tall) {
    // En vertical las filas ocupan todo el ancho: en vez de acercar, un foco recorre las mesas de dos en dos.
    const filas = [[1, 2], [3, 4], [5, 6], [7, 8]];
    for (const [i, par] of filas.entries()) {
      await at(1.0 + 0.9 * i, `foco mesas ${par.join(" y ")}`);
      await call("spot", union(par.map((n) => boxes[n])));
    }
    await call("spot", null);
  } else {
    await at(1.5, "fila de arriba");
    await call("drift", 1, 1.03, 1.7);
    await E.focus(r1, { k: 1.5 });
    await at(3.2, "mesas de abajo");
    await call("drift", 1, 1.03, 1.8);
    await E.focus(r2, { k: 1.4 });
  }
  await at(5.0, "zoom a la mesa 4");
  await call("cap", TEXTO.mesa4);
  await call("drift", 1, 1.05, 4);
  await call("spot", r4);
  await E.focus(r4, { k: tall ? 1.8 : 2.1, margin: 0.8, ms: 300 });
  await at(6.3, "6 personas");
  await call("chip", { x: r4.x + r4.w - (tall ? 130 : 175), y: r4.y - (tall ? 24 : 30) }, "6 personas");
  await at(9.0, "fin");
}

/** Toma B (9 a 17 s): el celular. Escanean, eligen partes iguales entre 6 y pagan por SINPE. */
export async function tomaB(E) {
  const { call, at, tall } = E;
  const ph = E.frame(/\/m\//);
  const btn = (name, o) => ph.getByRole("button", { name, ...o });

  await at(0, "escanean el QR");
  await call("show", "phone");
  await call("phoneDrift", 1, 1.05, 8);
  await call("scan", true);
  await call("cap", tall ? TEXTO.celular : TEXTO.celularLado, tall ? "band" : "side");
  await at(0.9, "la cuenta");
  await call("scan", false);
  await at(1.8, "partes iguales");
  await E.tap(btn(/Partes iguales/));
  await ph.getByRole("button", { name: "Más personas" }).waitFor({ state: "visible", timeout: 8000 });
  for (let i = 0; i < 4; i++) {
    await at(2.6 + 0.25 * i, `+ (${i + 3})`);
    await E.tap(ph.getByRole("button", { name: "Más personas" }), { scroll: false });
  }
  await at(3.9, "dividir");
  await E.tap(btn(/^Dividir en 6 partes/));
  const pagar = btn(/^Pagar ₡/);
  await pagar.waitFor({ state: "visible", timeout: 8000 });
  await at(4.7, "pagar");
  await E.tap(pagar);
  const hecho = btn(/Ya hice el SINPE/);
  await hecho.waitFor({ state: "visible", timeout: 8000 });
  await at(5.9, "copiar el monto");
  const copiar = ph.getByRole("button", { name: /Copiar/ }).first();
  if (await copiar.count()) await E.tap(copiar, { scroll: false }).catch(() => undefined);
  await at(6.6, "ya hice el SINPE");
  await E.tap(hecho);
  await at(8.0, "fin");
}

// Solo para la grabación: el panel muestra la mesa 4 sin avisos flotantes y con la lista de pagos a la vista.
const CSS_C = `
  div[aria-live="polite"] { display: none !important; }
  aside .border-sky-300 button { display: none !important; }
  aside div.justify-between.rounded-xl.border.p-4,
  aside p.-mt-2,
  aside dl,
  aside div.grid.grid-cols-2.gap-2:has(> span),
  aside a[href*="/panel/qr"] { display: none !important; }
  aside section li { padding: 0.45rem 0.75rem !important; }
  aside section li > div > p:nth-child(n+2) { display: none !important; }
  aside section li > div > p:first-child { font-size: 0.95rem; }
  html.solo-detalle main { visibility: hidden !important; }
  html.solo-detalle [role="dialog"] { left: 1040px !important; }
  [data-state="closed"] { display: none !important; }
  html.sin-detalle aside { visibility: hidden !important; }
  html.solo-detalle aside { border-left-color: transparent !important; }
  html.grande { font-size: 23px !important; }
  html.grande aside { padding-top: 36px !important; }
`;

/** Antes de grabar la toma C: se abre el detalle de la mesa 4 y se esconde lo que no cuenta la historia. */
export async function prepararC(page, tall = false) {
  const panel = page.frames().find((f) => /\/panel/.test(f.url()));
  // En vertical el aviso de confirmación sube para que el texto del video no lo tape.
  await panel.addStyleTag({ content: CSS_C + (tall ? `[role="dialog"] { bottom: 250px !important; left: 16px !important; right: 16px !important; width: auto !important; border-radius: 16px !important; }` : "") });
  await panel.getByRole("button", { name: /^Mesa 4,/ }).click();
  // Horizontal: solo se ve el detalle (sin tarjetas cortadas). Vertical: letra más grande para que llene la pantalla.
  await panel.evaluate((c) => document.documentElement.classList.add(c), tall ? "grande" : "solo-detalle");
  // Al confirmar «Liberar mesa» el panel vuelve a su tamaño normal en el mismo instante del clic.
  await panel.evaluate(() => {
    document.addEventListener("click", (e) => {
      const b = e.target instanceof Element ? e.target.closest('[role="dialog"] button') : null;
      if (!b || b.textContent?.trim() !== "Liberar mesa") return;
      const c = document.documentElement.classList;
      c.remove("grande");
      if (c.contains("solo-detalle")) {
        c.remove("solo-detalle"); c.add("sin-detalle");
        const a = window.__camGrid;
        if (a) window.parent.V.cam(...a, 0);
      }
    }, true);
  });
  await panel.getByText("SINPE por confirmar").first().waitFor({ state: "hidden", timeout: 100 }).catch(() => undefined);
}

/** Toma C (17 a 27 s): un SINPE por confirmar, cinco pagos más en la lista, mesa 4 libre y otras tres también. */
export async function tomaC(E, { sb, ctx, pagos, otras }) {
  const { call, at, tall } = E;
  const panel = E.frame(/\/panel/);
  const poke = () => panel.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  const LAT = 0.2; // lo que tarda el cambio en llegar desde la base de datos hasta la pantalla

  await at(0, "detalle mesa 4");
  await call("show", "panel");
  let gridRect = null;
  if (!tall) {
    gridRect = await panel.evaluate(() => {
      const rs = [...document.querySelectorAll("main button")].filter((b) => /^Mesa \d/.test(b.getAttribute("aria-label") ?? "")).map((b) => b.getBoundingClientRect());
      const x = Math.min(...rs.map((r) => r.x)), y = Math.min(...rs.map((r) => r.y));
      return { x, y, w: Math.max(...rs.map((r) => r.right)) - x, h: Math.max(...rs.map((r) => r.bottom)) - y };
    });
    const ga = E.focusArgs(gridRect, { k: 1.3 });
    await panel.evaluate((a) => { window.__camGrid = a; }, ga);
    const b = await panel.locator("aside").first().boundingBox();
    if (b) {
      // El detalle va centrado y más grande; el resto del panel queda oculto.
      const k = 1.1, cx = b.x + b.width / 2;
      await call("cam", cx, b.y, k, E.size.w / 2, 8, 0);
    }
  }
  await call("drift", 1, 1.03, 6);
  await at(0.4 - LAT, "llega un SINPE por confirmar");
  await revelarPago(sb, pagos[0]);
  await poke();
  await at(1.3, "Recibido");
  await call("cap", TEXTO.libre);
  await E.tap(panel.getByRole("button", { name: "Recibido" }).first(), { scroll: false });
  for (let i = 1; i < 6; i++) {
    await at(1.75 + 0.35 * (i - 1) - LAT, `línea ${i + 1} (${pagos[i].metodo})`);
    await revelarPago(sb, pagos[i], { auto: true });
    await poke();
  }
  await panel.getByRole("button", { name: "Liberar mesa" }).first().waitFor({ state: "visible", timeout: 8000 });
  await at(4.0, "Liberar mesa");
  await E.tap(panel.getByRole("button", { name: "Liberar mesa" }).first(), { scroll: false });
  await at(4.5, "confirmar");
  await E.tap(panel.getByRole("dialog").getByRole("button", { name: "Liberar mesa" }), { scroll: false });
  // Al confirmar, el detalle se cierra: la cuadrícula tiene que verse ya con su tamaño normal.
  if (tall) {
    // Vuelve a la cuadrícula y la letra recupera su tamaño en el mismo instante.
    await panel.evaluate(() => {
      document.documentElement.classList.remove("grande");
      document.querySelector('button[aria-label="Volver a las mesas"]')?.click();
    });
  } else {
    await panel.evaluate(() => { document.documentElement.classList.remove("solo-detalle"); document.documentElement.classList.add("sin-detalle"); });
    if (gridRect) await E.focus(gridRect, { k: 1.3, ms: 0 });
  }
  await at(5.6, "texto de la escena 5");
  await call("cap", TEXTO.atiende);
  await at(6.0, "escena 5");
  // Las otras tres mesas pagaron por su cuenta desde el QR y se liberan sin avisos.
  const cuentas = {};
  for (const n of otras) cuentas[n] = await marcarPagadaQR(sb, ctx, n, n === 6 ? "apple_pay" : "card");
  await poke();
  const free = [1, 6, 3];
  const times = [6.9, 7.8, 8.7];
  for (const [i, n] of free.entries()) {
    await at(times[i] - LAT, `liberar mesa ${n}`);
    await liberarMesa(sb, cuentas[n]);
    await poke();
  }
  await at(10.0, "fin");
}

/** Toma D (27 a 30 s): cierre. */
export async function tomaD(E) {
  const { call, at } = E;
  await at(0, "logo y piloto");
  await call("show", "end");
  await call("end", 1);
  await at(0.7, "sin instalación");
  await call("end", 2);
  await at(1.25, "divimesa.com");
  await call("end", 3);
  await at(1.9, "piloto: SINPE");
  await call("end", 4);
  await at(3.0, "fin");
}
