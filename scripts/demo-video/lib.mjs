// Lógica pura del video de la demo: argumentos, nombres de archivo, horario de las escenas y
// armado de los cuadros a 30 fps parejos. Sin dependencias, así se puede probar con Vitest.

export const FPS = 30;

/**
 * Segundo en que empieza cada escena (el video dura 43 s si todo va a tiempo). Los textos de cada
 * escena viven en components/demo/recording-stage.tsx; `cierre` es la frase final y `contacto`
 * el logo con divimesa.com y el WhatsApp.
 */
export const T = { intro: 0, cuenta: 3, paga: 10, panel: 20, resto: 27, cierre: 37, contacto: 40, fin: 43 };

export const DEFAULTS = { nombre: "Su Restaurante", color: "#D91E18" };

export const VIEWS = {
  horizontal: { width: 1920, height: 1080, vista: "wide" },
  vertical: { width: 1080, height: 1920, vista: "vertical" },
};

/** "#abc" o "#AABBCC" a "#aabbcc"; null si no es un color. */
export function normalizeHex(value) {
  const v = String(value ?? "").trim();
  const m3 = /^#([0-9a-fA-F]{3})$/.exec(v);
  if (m3) return "#" + [...m3[1]].map((c) => c + c).join("").toLowerCase();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null;
}

export function slugify(text) {
  return String(text)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Lee `--nombre "Il Vicolo" --color "#2E5E3A" [--solo horizontal|vertical] [--sin-build]`. */
export function parseArgs(argv) {
  const out = { nombre: DEFAULTS.nombre, color: DEFAULTS.color, nombreDado: false, colorDado: false, solo: null, sinBuild: false, ayuda: false, errores: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const eq = a.indexOf("=");
    const [key, inline] = a.startsWith("--") && eq > 0 ? [a.slice(0, eq), a.slice(eq + 1)] : [a, undefined];
    const next = () => (inline !== undefined ? inline : argv[++i]);
    if (key === "--nombre") {
      const v = (next() ?? "").trim();
      if (!v || v.length > 80) out.errores.push("--nombre necesita un texto de 1 a 80 letras.");
      else { out.nombre = v; out.nombreDado = true; }
    } else if (key === "--color") {
      const raw = next();
      const hex = normalizeHex(raw);
      if (!hex) out.errores.push(`--color "${raw ?? ""}" no es un color. Use el formato #2E5E3A.`);
      else { out.color = hex.toUpperCase(); out.colorDado = true; }
    } else if (key === "--solo") {
      const v = next();
      if (v !== "horizontal" && v !== "vertical") out.errores.push("--solo acepta horizontal o vertical.");
      else out.solo = v;
    } else if (key === "--sin-build") out.sinBuild = true;
    else if (key === "--ayuda" || key === "-h") out.ayuda = true;
    else out.errores.push(`Opción desconocida: ${a}`);
  }
  return out;
}

/** Nombres de los archivos: demo.mp4 por defecto, demo-il-vicolo.mp4 con --nombre. */
export function outputNames({ nombre, nombreDado, color, colorDado }) {
  let base = "demo";
  if (nombreDado) base += "-" + (slugify(nombre) || "restaurante");
  else if (colorDado) base += "-color-" + color.replace("#", "").toLowerCase();
  return { horizontal: `${base}.mp4`, vertical: `${base}-vertical.mp4` };
}

/**
 * Para cada cuadro de salida (a 30 fps parejos) elige el último cuadro capturado que ya existía en
 * ese instante. Donde la computadora se trabó y no llegaron cuadros, se repite el anterior.
 * `frames`: [{ ts (segundos, hora real), ... }] en cualquier orden. Devuelve índices a `frames` ordenado.
 */
export function planFrames(frames, t0, t1, fps = FPS) {
  if (!frames.length) throw new Error("No se capturó ningún cuadro.");
  const ts = frames.map((f) => f.ts);
  const n = Math.max(1, Math.round((t1 - t0) * fps));
  const plan = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const t = t0 + k / fps;
    while (j + 1 < ts.length && ts[j + 1] <= t + 1e-9) j++;
    plan.push(j);
  }
  return plan;
}

/** Texto para el "concat demuxer" de ffmpeg: agrupa los cuadros repetidos en una sola entrada. */
export function concatList(plan, files, fps = FPS) {
  const esc = (p) => p.replace(/\\/g, "/").replace(/'/g, "'\\''");
  const lines = [];
  for (let i = 0; i < plan.length; ) {
    let k = i;
    while (k < plan.length && plan[k] === plan[i]) k++;
    lines.push(`file '${esc(files[plan[i]])}'`, `duration ${((k - i) / fps).toFixed(6)}`);
    i = k;
  }
  // ffmpeg ignora la duración de la última entrada si no se repite el archivo.
  lines.push(`file '${esc(files[plan[plan.length - 1]])}'`);
  return lines.join("\n") + "\n";
}
