// El recorrido del video: toca los botones reales de la página del cliente (dentro del celular)
// y le dice a la capa de /demo?grabar=1 qué texto y qué círculo mostrar.

import { T } from "./lib.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * `t0` es la hora real (segundos) en que empezó la grabación. Las escenas arrancan a su hora fija
 * y, si la escena anterior se pasó de tiempo, arrancan apenas termina para que el texto y lo que
 * pasa en pantalla siempre coincidan. Devuelve la hora real (segundos) en que termina el video.
 */
export async function runChoreography({ page, view, t0, log }) {
  const now = () => Date.now() / 1000 - t0;
  const call = (fn, ...args) => page.evaluate(({ fn, args }) => window.__demoVideo[fn](...args), { fn, args });

  async function begin(name, scheduled) {
    const wait = scheduled - now();
    if (wait > 0) await sleep(wait * 1000);
    const late = now() - scheduled;
    log(`  ${now().toFixed(1).padStart(5)} s  ${name}${late > 0.6 ? `  (con ${late.toFixed(1)} s de retraso)` : ""}`);
  }

  const clientHandle = await page.locator('iframe[title^="Página del cliente"]').elementHandle();
  const client = await clientHandle.contentFrame();
  const clientUrl = client.url();
  const panelHandle = await page.locator('iframe[title="Panel del salonero"]').elementHandle();
  const panel = await panelHandle.contentFrame();
  const tall = view === "vertical";

  /** Centro del elemento en coordenadas de la página, tomando en cuenta posición y escala del iframe. */
  async function clientPoint(locator) {
    const inner = await locator.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    const f = await clientHandle.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, cw: el.clientWidth };
    });
    const k = f.cw ? f.w / f.cw : 1;
    return { x: f.x + inner.x * k, y: f.y + inner.y * k };
  }

  /** Círculo suave y toque real sobre un elemento del celular. */
  async function tap(locator, { pace = 1, scroll = true } = {}) {
    await locator.waitFor({ state: "visible", timeout: 20000 });
    if (scroll) {
      await locator.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
      await sleep(480 * pace);
    }
    // En la versión vertical el celular va escalado: calculamos el punto a mano.
    // (y esperamos a que termine el desplazamiento suave antes de tocar)
    let pt = await clientPoint(locator);
    for (let i = 0; i < 20; i++) {
      await sleep(80);
      const next = await clientPoint(locator);
      const quieto = Math.abs(next.x - pt.x) < 0.5 && Math.abs(next.y - pt.y) < 0.5;
      pt = next;
      if (quieto) break;
    }
    await call("tap", pt.x, pt.y);
    await sleep(300 * pace);
    await page.mouse.click(pt.x, pt.y);
    await sleep(220 * pace);
  }

  const btn = (name, opts) => client.getByRole("button", { name, ...opts });
  const payButton = () => btn(/^Pagar ₡/);

  /** Checkout simulado: confirmar el pago y esperar el comprobante. `at` = hora mínima del clic. */
  async function payInCheckout({ pace = 1, at = 0 } = {}) {
    await client.waitForURL(/\/checkout-demo\//, { timeout: 20000 });
    const pay = payButton();
    await pay.waitFor({ state: "visible", timeout: 20000 });
    const wait = at - now();
    if (wait > 0) await sleep(wait * 1000);
    await tap(pay, { pace, scroll: false });
    await btn(/Volver a la cuenta/).waitFor({ state: "visible", timeout: 30000 });
  }

  /** Del comprobante de vuelta a la cuenta. Con el celular fuera de escena, así que sin círculo ni coordenadas. */
  async function backToAccount({ at = 0 } = {}) {
    const wait = at - now();
    if (wait > 0) await sleep(wait * 1000);
    await btn(/Volver a la cuenta/).evaluate((el) => el.click());
    await client.waitForURL(/\/m\//, { timeout: 30000 });
    await client.locator('section[aria-label="Cuenta"]').waitFor({ timeout: 20000 });
  }

  /** Lleva la cámara del panel hacia la Mesa 4 y el aviso (punto medio, en coordenadas del panel). */
  async function panelFocus(zoom) {
    const pts = [];
    for (const loc of [panel.getByRole("button", { name: /^Mesa 4,/ }), panel.locator("div.animate-notice-in").first()]) {
      const p = await loc.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }, null, { timeout: 1500 }).catch(() => null);
      if (p) pts.push(p);
    }
    if (!pts.length) return;
    await call("panelCam", pts.reduce((a, p) => a + p.x, 0) / pts.length, pts.reduce((a, p) => a + p.y, 0) / pts.length, zoom);
  }

  const scrollToTotals = () => client.locator('section[aria-label="Cuenta"] dl').evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "end" }));

  const lines = client.locator('section[aria-label="Cuenta"] li button[aria-pressed]');
  const zoomPhone = tall ? 1.05 : 1.06;

  // 0 a 3 s: fondo escarlata con el logo y la pregunta (ya está en pantalla mientras cargan los iframes).
  await begin("inicio", T.intro);

  // 3 a 10 s: "Escanean el QR." El celular entra inclinado y se endereza antes del primer toque.
  await begin("escanean el QR", T.cuenta);
  await call("scene", "cuenta");
  await call("scan", true);
  await sleep(1900);
  await call("scan", false);
  await call("tilt", false);
  await sleep(1000);
  await scrollToTotals();
  await sleep(2400);
  await client.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));

  // 10 a 20 s: "Cada quien paga lo suyo." Elige 2 platos, propina del 10 % y Apple Pay.
  await begin("cada quien paga lo suyo", T.paga);
  await call("scene", "paga");
  await call("phoneZoom", zoomPhone);
  await sleep(600);
  await tap(btn(/Pagar mis platos/));
  await tap(lines.nth(0), { pace: 0.45 });
  await tap(lines.nth(1), { pace: 0.45 });
  await tap(client.getByRole("button", { name: "10 %", exact: true }), { pace: 0.45 });
  await tap(client.getByRole("radio", { name: "Apple Pay" }), { pace: 0.45 });
  await tap(payButton(), { pace: 0.45 });
  // El clic final del checkout cae unos 1,5 s antes de la escena siguiente, así el aviso sale al empezar.
  await payInCheckout({ pace: 0.8, at: T.panel - 1.5 });
  await call("phoneZoom", 1);

  // 20 a 27 s: "Usted lo ve al instante." El panel real y la cámara acercándose a la Mesa 4 y al aviso.
  await begin("usted lo ve al instante", T.panel);
  await call("scene", "panel");
  await panel.locator("div.animate-notice-in").first().waitFor({ state: "visible", timeout: 9000 }).catch(() => log("  aviso: el panel no mostró el aviso del pago a tiempo"));
  await sleep(500);
  await panelFocus(tall ? 1.2 : 1.45);
  // Mientras tanto el celular (fuera de escena) vuelve a la cuenta, listo para la escena siguiente.
  await backToAccount({ at: T.panel + 4 });
  await scrollToTotals();

  // 27 a 37 s: "Partes iguales, en segundos." Primero el celular pagando, después el panel.
  await begin("partes iguales", T.resto);
  await call("scene", "resto");
  await sleep(300);
  await call("phoneZoom", zoomPhone);
  await tap(btn(/Partes iguales/), { pace: 0.35 });
  await tap(btn(/Dividir en 2 partes/), { pace: 0.35 });
  await tap(payButton(), { pace: 0.35 });
  await payInCheckout({ pace: 0.35 });
  // La segunda persona escanea el mismo QR desde otro celular: sesión nueva.
  await client.evaluate(() => { try { window.localStorage.removeItem("qr-session"); } catch { /* sin localStorage */ } });
  await client.goto(clientUrl);
  await client.locator('section[aria-label="Cuenta"]').waitFor({ timeout: 20000 });
  await tap(btn(/Partes iguales/), { pace: 0.35 });
  await tap(payButton(), { pace: 0.35 });
  await payInCheckout({ pace: 0.35 });
  await call("phoneZoom", 1);
  // El panel: esperar a que la Mesa 4 esté verde con el aviso "pagó completo" y dejarlo quieto 3 s.
  await call("scene", "restoPanel");
  await panel.getByText(/pagó completo/).first().waitFor({ state: "visible", timeout: 15000 }).catch(() => log("  aviso: el panel no mostró \"pagó completo\" a tiempo"));
  await panel.getByRole("button", { name: /^Mesa 4, Pagada/ }).waitFor({ state: "visible", timeout: 8000 }).catch(() => log("  aviso: la Mesa 4 no se vio verde a tiempo"));
  await sleep(500);
  await panelFocus(tall ? 1.2 : 1.45);
  await sleep(1300);
  await call("hold", true);
  await sleep(3000);
  await call("hold", false);

  // 37 a 40 s: frase final. 40 a 43 s: logo, divimesa.com y WhatsApp.
  await begin("sin app y sin equipo nuevo", T.cierre);
  await call("scene", "cierre");
  // La frase se queda sus 3 s completos aunque se haya llegado tarde.
  await sleep(Math.max(0, T.contacto - T.cierre) * 1000);
  log(`  ${now().toFixed(1).padStart(5)} s  logo y contacto`);
  await call("scene", "contacto");
  const end = now() + (T.fin - T.contacto);
  await sleep((end - now()) * 1000);
  log(`  ${now().toFixed(1).padStart(5)} s  fin`);
  return t0 + end;
}
