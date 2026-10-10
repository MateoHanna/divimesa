// El recorrido del video: toca los botones reales de la página del cliente (dentro del celular)
// y le dice a la capa de /demo?grabar=1 qué texto y qué círculo mostrar.

import { CAPTIONS, T } from "./lib.mjs";

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
  const panelHandle = view === "vertical" ? null : await page.locator('iframe[title="Panel del salonero"]').elementHandle();
  const panel = panelHandle ? await panelHandle.contentFrame() : null;

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

  /** Del comprobante de vuelta a la cuenta. `at` = hora mínima del clic. */
  async function backToAccount({ pace = 1, at = 0 } = {}) {
    const wait = at - now();
    if (wait > 0) await sleep(wait * 1000);
    await tap(btn(/Volver a la cuenta/), { pace, scroll: false });
    await client.waitForURL(/\/m\//, { timeout: 30000 });
    await client.locator('section[aria-label="Cuenta"]').waitFor({ timeout: 20000 });
  }

  const scrollToTotals = () => client.locator('section[aria-label="Cuenta"] dl').evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "end" }));

  // 0 a 3 s: tarjeta de inicio (ya está visible mientras cargan el celular y el panel).
  await begin("tarjeta de inicio", T.intro);

  // 3 a 10 s: escanean el QR y ven la cuenta.
  await begin("escanean el QR y ven la cuenta", T.cuenta);
  await call("card", null);
  await call("caption", CAPTIONS.cuenta);
  await call("scan", true);
  await sleep(1900);
  await call("scan", false);
  await sleep(900);
  await client.locator('section[aria-label="Cuenta"] dl').evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "end" }));
  await sleep(2200);
  await client.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));

  // 10 a 20 s: elige 2 platos, propina del 10 % y Apple Pay.
  await begin("cada quien paga lo suyo", T.paga);
  await call("caption", CAPTIONS.paga);
  await tap(btn(/Pagar mis platos/));
  const lines = client.locator('section[aria-label="Cuenta"] li button[aria-pressed]');
  await tap(lines.nth(0), { pace: 0.55 });
  await tap(lines.nth(1), { pace: 0.55 });
  await tap(client.getByRole("button", { name: "10 %", exact: true }), { pace: 0.55 });
  await tap(client.getByRole("radio", { name: "Apple Pay" }), { pace: 0.55 });
  await tap(payButton(), { pace: 0.55 });
  // El clic final del checkout cae unos 1,5 s antes de la escena 4, así el aviso sale justo al empezar.
  await payInCheckout({ pace: 0.8, at: T.panel - 1.5 });

  // 20 a 27 s: el aviso en el panel y el saldo bajando (en el celular).
  await begin("usted lo ve al instante", T.panel);
  await call("caption", CAPTIONS.panel);
  await backToAccount({ pace: 0.8, at: T.panel + 1.8 });
  await sleep(500);
  await scrollToTotals();

  // 27 a 35 s: dos personas pagan el resto en partes iguales y la mesa se pone verde.
  await begin("dos personas pagan el resto", T.resto);
  await call("caption", CAPTIONS.resto);
  await tap(btn(/Partes iguales/), { pace: 0.5 });
  await tap(btn(/Dividir en 2 partes/), { pace: 0.5 });
  await tap(payButton(), { pace: 0.5 });
  await payInCheckout({ pace: 0.5 });
  // La segunda persona escanea el mismo QR desde otro celular: sesión nueva.
  await client.evaluate(() => { try { window.localStorage.removeItem("qr-session"); } catch { /* sin localStorage */ } });
  await client.goto(clientUrl);
  await client.locator('section[aria-label="Cuenta"]').waitFor({ timeout: 20000 });
  await tap(btn(/Partes iguales/), { pace: 0.5 });
  await tap(payButton(), { pace: 0.5 });
  await payInCheckout({ pace: 0.5 });
  // Que la mesa ya se vea verde (y con el aviso fijo) antes de pasar a la tarjeta final.
  if (panel) {
    await panel.getByText(/pagó completo/).first().waitFor({ state: "visible", timeout: 12000 }).catch(() => log("  aviso: el panel no mostró \"pagó completo\" a tiempo"));
    await sleep(900);
  }

  // 35 a 40 s: tarjeta final.
  await begin("tarjeta final", T.cierre);
  await call("caption", null);
  await call("card", "outro");
  const end = Math.max(now(), T.cierre) + (T.fin - T.cierre);
  await sleep((end - now()) * 1000);
  log(`  ${now().toFixed(1).padStart(5)} s  fin`);
  return t0 + end;
}
