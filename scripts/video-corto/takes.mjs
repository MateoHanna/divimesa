// Las 4 tomas del video. Cada una se graba en tiempo real con la app funcionando de verdad, y `at(t)` espera
// al segundo t de la toma. Los tiempos son los del guion (0-9 s, 9-17 s, 17-27 s y 27-30 s del video final).

import { liberarMesa, marcarPagada, revelarPago } from "./fixture.mjs";

export const DURACION = { a: 9, b: 8, c: 10, d: 3 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const METODOS = ["sinpe", "apple_pay", "sinpe", "card", "sinpe", "apple_pay"];
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
    async focus(rect, { k, margin = 0.9, ms = 0 } = {}) {
      const availH = size.h - BAND;
      const fit = Math.min((size.w * margin) / rect.w, (availH * margin) / rect.h);
      const z = Math.max(1, Math.min(k ?? fit, fit));
      const px = rect.x + rect.w / 2, py = rect.y + rect.h / 2;
      const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
      const tx = clamp(size.w / 2 - z * px, size.w - z * size.w, 0) + z * px;
      const ty = clamp(availH / 2 - z * py, size.h - z * size.h, 0) + z * py;
      await call("cam", px, py, z, tx, ty, ms);
      return z;
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

/** Toma C (17 a 27 s): seis avisos, el salonero toca «Recibido», la mesa 4 queda libre y otras tres también. */
export async function tomaC(E, { sb, ctx, pagos, otras }) {
  const { call, at } = E;
  const panel = E.frame(/\/panel/);
  const poke = () => panel.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  const LAT = 0.2; // lo que tarda el aviso en llegar desde la base de datos hasta la pantalla

  await at(0, "panel");
  await call("show", "panel");
  await call("drift", 1, 1.03, 10);
  for (let i = 0; i < 6; i++) {
    await at(0.3 + 0.35 * i - LAT, `aviso ${i + 1} (${pagos[i].metodo})`);
    await revelarPago(sb, pagos[i]);
    await poke();
    if (i === 3) await call("cap", TEXTO.libre);
  }
  // El salonero toca «Recibido» en el primero y los otros dos siguen enseguida (cámara rápida).
  await at(3.3, "Recibido 1");
  const recibido = () => panel.getByRole("button", { name: "Recibido" });
  await E.tap(recibido().first(), { scroll: false });
  await at(3.65, "Recibido 2");
  await E.tap(recibido().first(), { scroll: false });
  await at(3.95, "Recibido 3");
  await E.tap(recibido().first(), { scroll: false });
  await panel.getByRole("button", { name: "Liberar mesa" }).first().waitFor({ state: "visible", timeout: 8000 });
  await at(4.8, "Liberar mesa");
  await E.tap(panel.getByRole("button", { name: "Liberar mesa" }).first(), { scroll: false });
  // Las otras tres mesas ya habían pagado por su cuenta: quedan "Pagada" justo antes del corte.
  await at(5.3, "otras mesas pagadas");
  const cuentas = {};
  for (const n of otras) cuentas[n] = await marcarPagada(sb, ctx, n);
  await poke();
  await at(6.0, "escena 5");
  await call("cap", TEXTO.atiende);
  const free = [1, 6, 3];
  const times = [6.4, 7.2, 8.4];
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
