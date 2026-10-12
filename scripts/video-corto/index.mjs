#!/usr/bin/env node
// Video de 30 s (horizontal y vertical) grabado solo con la app: el panel y el celular reales, con textos y zoom encima.
// Uso: npm run demo:video:corto -- --ayuda

import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, request as pwRequest } from "playwright-core";

import { FPS, concatList, planFrames } from "../demo-video/lib.mjs";
import { METODOS, DURACION, entorno, tomaA, tomaB, tomaC, tomaD } from "./takes.mjs";
import { adminClient, dividirMesa4, prepararMesas, prepararPagos, restaurarDemo } from "./fixture.mjs";
import { SIZES, stageHtml } from "./stage.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT_DIR = path.join(ROOT, "videos");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

const AYUDA = `
Genera el video de 30 segundos de Divimesa (horizontal 1920x1080 y vertical 1080x1920).

  npm run demo:video:corto

Opciones:
  --solo horizontal|vertical  solo una de las dos versiones
  --sin-build                 no volver a compilar la app (usa la compilación anterior)
  --url http://localhost:3000 usar una app que ya está corriendo (no compila ni la levanta)

Graba en el restaurante de demostración (nunca en uno real): deja 8 mesas abiertas, graba y al terminar
reinicia la demo. Los videos quedan en la carpeta videos/ (demo.mp4 y demo-vertical.mp4, más tres pósters).
`;

const fail = (m) => { console.error("\nError: " + m); process.exitCode = 1; };

function parse(argv) {
  const o = { solo: null, sinBuild: false, url: null, ayuda: false, errores: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--solo") { const v = argv[++i]; if (v !== "horizontal" && v !== "vertical") o.errores.push("--solo acepta horizontal o vertical."); else o.solo = v; }
    else if (a === "--sin-build") o.sinBuild = true;
    else if (a === "--url") o.url = argv[++i];
    else if (a === "--ayuda" || a === "-h") o.ayuda = true;
    else o.errores.push(`Opción desconocida: ${a}`);
  }
  return o;
}

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.once("error", reject);
  s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); });
});
const run = (cmd, args, opts) => new Promise((resolve) => {
  const child = spawn(cmd, args, { cwd: ROOT, ...opts });
  let out = "";
  child.stdout?.on("data", (d) => { out += d; });
  child.stderr?.on("data", (d) => { out += d; });
  child.on("close", (code) => resolve({ code, out }));
});
async function ffmpegPath() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try { const m = await import("ffmpeg-static"); if (m.default && fs.existsSync(m.default)) return m.default; } catch { /* sistema */ }
  return "ffmpeg";
}
async function launchBrowser() {
  const custom = process.env.DEMO_BROWSER_PATH;
  const attempts = custom ? [{ executablePath: custom, label: custom }] : [{ channel: "chrome", label: "Chrome" }, { channel: "msedge", label: "Edge" }];
  const errors = [];
  for (const { label, ...opt } of attempts) {
    try { const b = await chromium.launch({ headless: true, ...opt }); log(`Navegador: ${label}`); return b; }
    catch (e) { errors.push(`${label}: ${String(e.message).split("\n")[0]}`); }
  }
  throw new Error(`No se encontró Chrome ni Edge.\n  ${errors.join("\n  ")}\n  Defina DEMO_BROWSER_PATH con la ruta de un navegador basado en Chromium.`);
}

async function main() {
  const args = parse(process.argv.slice(2));
  if (args.ayuda) return log(AYUDA);
  if (args.errores.length) return fail(args.errores.join("\n") + "\n" + AYUDA);

  const envFile = path.join(ROOT, ".env.local");
  if (fs.existsSync(envFile) && typeof process.loadEnvFile === "function") process.loadEnvFile(envFile);
  const missing = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "PANEL_PIN"].filter((k) => !process.env[k]);
  if (missing.length) return fail(`Faltan estas variables en .env.local: ${missing.join(", ")}.`);

  const views = args.solo ? [args.solo] : ["horizontal", "vertical"];
  const tmpRoot = path.join(os.tmpdir(), `divimesa-video-${Date.now().toString(36)}`);
  const nextBin = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
  let server = null, browser = null, api = null, sb = null, cleaned = false;

  async function cleanup() {
    if (cleaned) return;
    cleaned = true;
    if (sb) { try { await restaurarDemo(sb); log("Demo reiniciada."); } catch (e) { console.error("No se pudo reiniciar la demo. Hágalo desde el panel (Restaurar la demo):", e.message); } }
    await api?.dispose().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    if (server && !server.killed) server.kill();
    await fsp.rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined);
  }
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { cleanup().finally(() => process.exit(130)); });

  try {
    await fsp.mkdir(OUT_DIR, { recursive: true });
    await fsp.mkdir(tmpRoot, { recursive: true });
    let base = args.url;
    if (!base) {
      if (args.sinBuild) {
        if (!fs.existsSync(path.join(ROOT, ".next", "BUILD_ID"))) throw new Error("No hay una compilación anterior. Corra el comando sin --sin-build.");
      } else {
        log("Compilando la app (puede tardar un par de minutos)…");
        const b = await run(process.execPath, [nextBin, "build"], { env: process.env });
        if (b.code !== 0) throw new Error("Falló la compilación:\n" + b.out.split("\n").slice(-30).join("\n"));
      }
      const port = await freePort();
      base = `http://localhost:${port}`;
      log(`Levantando la app en ${base}…`);
      let serverOut = "";
      server = spawn(process.execPath, [nextBin, "start", "-p", String(port)], { cwd: ROOT, env: { ...process.env, APP_URL: base }, stdio: ["ignore", "pipe", "pipe"] });
      server.stdout.on("data", (d) => { serverOut += d; });
      server.stderr.on("data", (d) => { serverOut += d; });
      let up = false;
      for (let i = 0; i < 90 && !up; i++) {
        await sleep(1000);
        try { up = (await fetch(`${base}/`)).ok; } catch { /* todavía no */ }
        if (server.exitCode !== null) break;
      }
      if (!up) throw new Error("La app no arrancó. Últimas líneas:\n" + serverOut.split("\n").slice(-15).join("\n"));
    }
    const health = await fetch(`${base}/api/health`).catch(() => null);
    if (!health?.ok) throw new Error("La app no llega a Supabase. Revise NEXT_PUBLIC_SUPABASE_URL y la conexión.");

    api = await pwRequest.newContext({ baseURL: base, extraHTTPHeaders: { origin: base } });
    const login = await api.post("/api/panel/login", { data: { pin: process.env.PANEL_PIN } });
    if (!login.ok()) throw new Error(`No se pudo entrar al panel de la demo (código ${login.status()}). Revise PANEL_PIN en .env.local.`);
    const st = await (await api.get("/api/panel/state")).json();
    if (!st.state?.restaurant?.isDemo && st.state?.restaurant?.name !== "Su Restaurante") log("Aviso: el panel no parece ser el de la demo.");
    const storage = await api.storageState();
    sb = adminClient();
    browser = await launchBrowser();
    const ffmpeg = await ffmpegPath();

    for (const view of views) {
      const size = SIZES[view];
      log(`\nVersión ${view} (${size.out[0]}x${size.out[1]})`);
      const clips = [];
      for (const [name, take] of [["a", tomaA], ["b", tomaB], ["c", tomaC], ["d", tomaD]]) {
        log(`  Toma ${name.toUpperCase()}`);
        const ctx = await prepararMesas(sb);
        const extra = {};
        if (name === "c") {
          await dividirMesa4(sb, ctx);
          extra.pagos = await prepararPagos(sb, ctx, METODOS);
          extra.sb = sb; extra.ctx = ctx; extra.otras = [1, 6, 3];
        }
        const context = await browser.newContext({ storageState: storage, viewport: { width: size.w, height: size.h }, deviceScaleFactor: size.dsf, locale: "es-CR" });
        await context.route(`${base}/__video`, (route) => route.fulfill({ contentType: "text/html; charset=utf-8", body: stageHtml({ view, root: ROOT, token: ctx.token4, siteUrl: "https://divimesa.com" }) }));
        const page = await context.newPage();
        const dir = path.join(tmpRoot, `${view}-${name}`);
        await fsp.mkdir(dir, { recursive: true });
        const frames = [], writes = [];
        try {
          await page.goto(`${base}/__video`);
          await page.waitForFunction(() => window.V?.ready === true);
          await page.evaluate((n) => window.V.show(n), name === "b" ? "phone" : name === "d" ? "end" : "panel");
          const needsPanel = name === "a" || name === "c";
          if (needsPanel) {
            const pf = page.frames().find((f) => /\/panel/.test(f.url()));
            await pf.getByRole("button", { name: /^Mesa 8,/ }).waitFor({ timeout: 30000 });
          }
          if (name === "b") {
            const mf = page.frames().find((f) => /\/m\//.test(f.url()));
            await mf.locator('section[aria-label="Cuenta"]').waitFor({ timeout: 30000 });
          }
          await sleep(500);
          const cdp = await context.newCDPSession(page);
          cdp.on("Page.screencastFrame", (ev) => {
            const file = path.join(dir, `f${frames.length}.jpg`);
            frames.push({ ts: ev.metadata.timestamp, file });
            writes.push(fsp.writeFile(file, Buffer.from(ev.data, "base64")));
            cdp.send("Page.screencastFrameAck", { sessionId: ev.sessionId }).catch(() => undefined);
          });
          await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: size.out[0], maxHeight: size.out[1], everyNthFrame: 1 });
          const E = entorno(page, view, size, log);
          const t0 = Date.now() / 1000;
          E.start(t0);
          await take(E, extra);
          const dur = DURACION[name];
          await sleep(120);
          await cdp.send("Page.stopScreencast").catch(() => undefined);
          await Promise.all(writes);
          frames.sort((x, y) => x.ts - y.ts);
          const plan = planFrames(frames, t0, t0 + dur, FPS);
          const listFile = path.join(dir, "cuadros.txt");
          await fsp.writeFile(listFile, concatList(plan, frames.map((f) => f.file), FPS));
          const clip = path.join(tmpRoot, `${view}-${name}.mp4`);
          const enc = await run(ffmpeg, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listFile,
            "-vf", `scale=${size.out[0]}:${size.out[1]}:flags=lanczos,fps=${FPS},format=yuv420p`, "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-g", "30", "-an", clip], {});
          if (enc.code !== 0) throw new Error("ffmpeg falló:\n" + enc.out.split("\n").slice(-12).join("\n"));
          log(`    ${frames.length} cuadros capturados, ${plan.length} en la toma`);
          clips.push(clip);
        } catch (e) {
          const shot = path.join(OUT_DIR, `error-${view}-${name}.png`);
          await page.screenshot({ path: shot }).catch(() => undefined);
          throw new Error(`Falló la toma ${name} (${view}): ${e.message}\n  Captura: ${path.relative(ROOT, shot)}`);
        } finally {
          await context.close().catch(() => undefined);
        }
      }
      const list = path.join(tmpRoot, `${view}-todo.txt`);
      await fsp.writeFile(list, clips.map((c) => `file '${c.replace(/\\/g, "/")}'`).join("\n") + "\n");
      const out = path.join(OUT_DIR, view === "horizontal" ? "demo.mp4" : "demo-vertical.mp4");
      const cat = await run(ffmpeg, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", out], {});
      if (cat.code !== 0) throw new Error("ffmpeg falló al juntar las tomas:\n" + cat.out);
      // Póster: el primer cuadro con texto (el panel lleno).
      const poster = path.join(OUT_DIR, view === "horizontal" ? "demo-poster-cuenta.jpg" : "demo-vertical-poster-cuenta.jpg");
      await run(ffmpeg, ["-y", "-loglevel", "error", "-ss", "0.6", "-i", out, "-frames:v", "1", "-q:v", "3", poster], {});
      if (view === "horizontal") await run(ffmpeg, ["-y", "-loglevel", "error", "-ss", "0.6", "-i", out, "-frames:v", "1", "-vf", "scale=1280:720", "-q:v", "3", path.join(OUT_DIR, "demo-poster.jpg")], {});
      log(`Listo: ${path.relative(ROOT, out)}`);
    }
  } catch (e) {
    fail(e.message);
  } finally {
    await cleanup();
  }
}

await main();
