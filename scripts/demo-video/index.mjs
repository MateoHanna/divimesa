#!/usr/bin/env node
// Genera el video de la demo: levanta la app en local, abre /demo?grabar=1, graba el recorrido
// y arma el mp4 con la hora real de cada cuadro. Uso: npm run demo:video -- --ayuda

import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, request as pwRequest } from "playwright-core";

import { runChoreography } from "./choreography.mjs";
import { FPS, VIEWS, concatList, outputNames, parseArgs, planFrames } from "./lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT_DIR = path.join(ROOT, "videos");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

const AYUDA = `
Genera el video de la demo de Divimesa.

  npm run demo:video                                  video con "Su Restaurante" y el color de Divimesa
  npm run demo:video -- --nombre "Il Vicolo" --color "#2E5E3A"

Opciones:
  --nombre "texto"            nombre del restaurante que se ve en el video (por defecto: Su Restaurante)
  --color "#RRGGBB"           color del restaurante (por defecto: #D91E18, el de Divimesa)
  --solo horizontal|vertical  solo una de las dos versiones
  --sin-build                 no volver a compilar la app (usa la compilación anterior)

Los videos quedan en la carpeta videos/. Al terminar se reinicia la demo y se restaura el
nombre y el color que tenía el restaurante. No cierre Chrome ni toque el mouse durante la grabación.
`;

function fail(msg) {
  console.error("\nError: " + msg);
  process.exitCode = 1;
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

function run(cmd, args, opts) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: ROOT, ...opts });
    let out = "";
    child.stdout?.on("data", (d) => { out += d; });
    child.stderr?.on("data", (d) => { out += d; });
    child.on("close", (code) => resolve({ code, out }));
  });
}

async function ffmpegPath() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    const mod = await import("ffmpeg-static");
    if (mod.default && fs.existsSync(mod.default)) return mod.default;
  } catch { /* se prueba el del sistema */ }
  return "ffmpeg";
}

async function launchBrowser() {
  const custom = process.env.DEMO_BROWSER_PATH;
  const attempts = custom ? [{ executablePath: custom, label: custom }] : [{ channel: "chrome", label: "Chrome" }, { channel: "msedge", label: "Edge" }];
  const errors = [];
  for (const { label, ...opt } of attempts) {
    try {
      const browser = await chromium.launch({ headless: true, ...opt });
      log(`Navegador: ${label}`);
      return browser;
    } catch (e) {
      errors.push(`${label}: ${String(e.message).split("\n")[0]}`);
    }
  }
  throw new Error(`No se encontró Chrome ni Edge instalados.\n  ${errors.join("\n  ")}\n  Instale Chrome o defina DEMO_BROWSER_PATH con la ruta de un navegador basado en Chromium.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.ayuda) return log(AYUDA);
  if (args.errores.length) return fail(args.errores.join("\n") + "\n" + AYUDA);

  // Variables de .env.local: solo se comprueba que existan, nunca se imprimen.
  const envFile = path.join(ROOT, ".env.local");
  if (fs.existsSync(envFile) && typeof process.loadEnvFile === "function") process.loadEnvFile(envFile);
  const missing = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "PANEL_PIN", "MOCK_WEBHOOK_SECRET"].filter((k) => !process.env[k]);
  if (missing.length) return fail(`Faltan estas variables en .env.local: ${missing.join(", ")}.`);

  const names = outputNames(args);
  const views = args.solo ? [args.solo] : ["horizontal", "vertical"];
  const nextBin = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
  const runId = Date.now().toString(36);
  const tmpRoot = path.join(os.tmpdir(), `divimesa-video-${runId}`);

  let server = null;
  let browser = null;
  let api = null;
  let original = null;
  let cleaned = false;

  async function cleanup() {
    if (cleaned) return;
    cleaned = true;
    if (api) {
      try {
        if (original) await api.patch("/api/panel/branding", { data: { name: original.name, primaryColor: original.primaryColor } });
        await api.post("/api/panel/demo/reset");
        log("Demo reiniciada y nombre y color restaurados.");
      } catch (e) {
        console.error("No se pudo reiniciar la demo ni restaurar el nombre y el color. Hágalo desde el panel:", e.message);
      }
      await api.dispose().catch(() => undefined);
    }
    await browser?.close().catch(() => undefined);
    if (server && !server.killed) server.kill();
    await fsp.rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined);
  }
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { cleanup().finally(() => process.exit(130)); });

  try {
    await fsp.mkdir(OUT_DIR, { recursive: true });
    await fsp.mkdir(tmpRoot, { recursive: true });

    if (args.sinBuild) {
      if (!fs.existsSync(path.join(ROOT, ".next", "BUILD_ID"))) throw new Error("No hay una compilación anterior. Corra el comando sin --sin-build.");
    } else {
      log("Compilando la app (puede tardar un par de minutos)…");
      const b = await run(process.execPath, [nextBin, "build"], { env: process.env });
      if (b.code !== 0) throw new Error("Falló la compilación:\n" + b.out.split("\n").slice(-30).join("\n"));
    }

    const port = await freePort();
    const base = `http://localhost:${port}`;
    log(`Levantando la app en ${base}…`);
    let serverOut = "";
    // APP_URL apunta a esta misma copia local: el checkout simulado se llama a sí mismo (webhook) por esa
  // dirección, así que nunca toca el dominio de producción aunque .env.local diga otra cosa.
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
    const health = await fetch(`${base}/api/health`).catch(() => null);
    if (!health?.ok) throw new Error("La app arrancó pero no llega a Supabase. Revise NEXT_PUBLIC_SUPABASE_URL y la conexión a internet.");

    api = await pwRequest.newContext({ baseURL: base });
    const login = await api.post("/api/panel/login", { data: { pin: process.env.PANEL_PIN } });
    if (!login.ok()) throw new Error(`No se pudo entrar al panel (código ${login.status()}). Revise PANEL_PIN en .env.local.`);
    const st = await (await api.get("/api/panel/state")).json();
    original = { name: st.state.restaurant.name, primaryColor: st.state.restaurant.primaryColor };
    if (st.state.restaurant.logoUrl) log("Aviso: el restaurante tiene un logo propio y saldrá en el video. Quítelo desde el panel si no lo quiere.");
    const set = await api.patch("/api/panel/branding", { data: { name: args.nombre, primaryColor: args.color } });
    if (!set.ok()) throw new Error(`No se pudo cambiar el nombre y el color (código ${set.status()}).`);
    log(`Restaurante en el video: "${args.nombre}", color ${args.color}`);

    browser = await launchBrowser();
    const ffmpeg = await ffmpegPath();
    const storage = await api.storageState();

    for (const view of views) {
      const { width, height, vista } = VIEWS[view];
      const out = path.join(OUT_DIR, names[view]);
      log(`\nGrabando la versión ${view} (${width}x${height})…`);
      const reset = await api.post("/api/panel/demo/reset");
      if (!reset.ok()) throw new Error(`No se pudo reiniciar la demo antes de grabar (código ${reset.status()}).`);

      const context = await browser.newContext({ storageState: storage, viewport: { width, height }, deviceScaleFactor: 1, locale: "es-CR" });
      const page = await context.newPage();
      const frames = [];
      const writes = [];
      const dir = path.join(tmpRoot, view);
      await fsp.mkdir(dir, { recursive: true });
      try {
        await page.goto(`${base}/demo?grabar=1&vista=${vista}`);
        await page.waitForFunction(() => window.__demoVideo?.ready === true, null, { timeout: 30000 });
        const clientFrame = await (await page.locator('iframe[title^="Página del cliente"]').elementHandle()).contentFrame();
        await clientFrame.locator('section[aria-label="Cuenta"]').waitFor({ timeout: 30000 });
        const panelFrame = await (await page.locator('iframe[title="Panel del salonero"]').elementHandle()).contentFrame();
        await panelFrame.getByRole("heading", { level: 1 }).waitFor({ timeout: 30000 });
        await sleep(800);

        const cdp = await context.newCDPSession(page);
        cdp.on("Page.screencastFrame", (ev) => {
          const file = path.join(dir, `f${frames.length}.jpg`);
          frames.push({ ts: ev.metadata.timestamp, file });
          writes.push(fsp.writeFile(file, Buffer.from(ev.data, "base64")));
          cdp.send("Page.screencastFrameAck", { sessionId: ev.sessionId }).catch(() => undefined);
        });
        await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: width, maxHeight: height, everyNthFrame: 1 });
        const t0 = Date.now() / 1000;
        const t1 = await runChoreography({ page, view, t0, log });
        await sleep(250);
        await cdp.send("Page.stopScreencast").catch(() => undefined);
        await Promise.all(writes);

        frames.sort((a, b) => a.ts - b.ts);
        const plan = planFrames(frames, t0, t1, FPS);
        const listFile = path.join(dir, "cuadros.txt");
        await fsp.writeFile(listFile, concatList(plan, frames.map((f) => f.file), FPS));
        log(`Armando el mp4 (${frames.length} cuadros capturados, ${plan.length} en el video)…`);
        const enc = await run(ffmpeg, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listFile,
          "-vf", `scale=${width}:${height}:flags=lanczos,fps=${FPS},format=yuv420p`, "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-movflags", "+faststart", out], {});
        if (enc.code !== 0) throw new Error("ffmpeg falló:\n" + enc.out.split("\n").slice(-12).join("\n"));
        log(`Listo: ${path.relative(ROOT, out)}`);
      } catch (e) {
        const shot = path.join(OUT_DIR, `error-${view}.png`);
        await page.screenshot({ path: shot }).catch(() => undefined);
        throw new Error(`Falló la grabación ${view}: ${e.message}\n  Captura de pantalla: ${path.relative(ROOT, shot)}`);
      } finally {
        await context.close().catch(() => undefined);
      }
    }
  } catch (e) {
    fail(e.message);
  } finally {
    await cleanup();
  }
}

await main();
