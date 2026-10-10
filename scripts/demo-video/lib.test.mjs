import { describe, expect, it } from "vitest";

import { CAPTIONS, DEFAULTS, T, concatList, normalizeHex, outputNames, parseArgs, planFrames, slugify } from "./lib.mjs";

describe("argumentos", () => {
  it("usa Su Restaurante y el escarlata por defecto", () => {
    const a = parseArgs([]);
    expect(a).toMatchObject({ nombre: "Su Restaurante", color: "#D91E18", nombreDado: false, colorDado: false, errores: [] });
    expect(DEFAULTS.nombre).toBe("Su Restaurante");
  });
  it("lee --nombre y --color, con espacio o con =", () => {
    expect(parseArgs(["--nombre", "Il Vicolo", "--color", "#2E5E3A"])).toMatchObject({ nombre: "Il Vicolo", color: "#2E5E3A", nombreDado: true, colorDado: true, errores: [] });
    expect(parseArgs(["--nombre=Café Tica", "--color=#abc"])).toMatchObject({ nombre: "Café Tica", color: "#AABBCC", errores: [] });
  });
  it("avisa de colores y opciones inválidas", () => {
    expect(parseArgs(["--color", "verde"]).errores[0]).toMatch(/no es un color/);
    expect(parseArgs(["--nombre"]).errores[0]).toMatch(/--nombre/);
    expect(parseArgs(["--solo", "cuadrado"]).errores[0]).toMatch(/--solo/);
    expect(parseArgs(["--raro"]).errores[0]).toMatch(/desconocida/);
  });
  it("--solo y --sin-build", () => {
    expect(parseArgs(["--solo", "vertical", "--sin-build"])).toMatchObject({ solo: "vertical", sinBuild: true, errores: [] });
  });
});

describe("nombres de archivo", () => {
  it("slug sin tildes ni símbolos", () => {
    expect(slugify("Il Vicolo")).toBe("il-vicolo");
    expect(slugify("  La Cabaña & Co.  ")).toBe("la-cabana-co");
  });
  it("demo.mp4 sin parámetros; con nombre o color cambia", () => {
    expect(outputNames(parseArgs([]))).toEqual({ horizontal: "demo.mp4", vertical: "demo-vertical.mp4" });
    expect(outputNames(parseArgs(["--nombre", "Il Vicolo"]))).toEqual({ horizontal: "demo-il-vicolo.mp4", vertical: "demo-il-vicolo-vertical.mp4" });
    expect(outputNames(parseArgs(["--color", "#2E5E3A"])).horizontal).toBe("demo-color-2e5e3a.mp4");
  });
  it("normalizeHex", () => {
    expect(normalizeHex("#2E5E3A")).toBe("#2e5e3a");
    expect(normalizeHex("2E5E3A")).toBeNull();
  });
});

describe("horario", () => {
  it("las escenas pedidas", () => {
    expect(T).toEqual({ intro: 0, cuenta: 3, paga: 10, panel: 20, resto: 27, cierre: 35, fin: 40 });
    expect(CAPTIONS.panel).toBe("Usted lo ve al instante");
  });
});

describe("cuadros a 30 fps parejos", () => {
  const frames = (...ts) => ts.map((t, i) => ({ ts: t, file: `f${i}.jpg` }));

  it("saca exactamente 30 cuadros por segundo", () => {
    expect(planFrames(frames(100, 100.5), 100, 102, 30)).toHaveLength(60);
    expect(planFrames(frames(100), 100, 40 + 100, 30)).toHaveLength(1200);
  });

  it("repite el cuadro anterior cuando la computadora se trabó", () => {
    // Llegan cuadros en 0 s, 0,1 s y recién en 1,5 s: entre medio se repite el de 0,1 s.
    const plan = planFrames(frames(10, 10.1, 11.5), 10, 12, 30);
    expect(plan[0]).toBe(0);
    expect(plan[3]).toBe(1);
    expect(plan[44]).toBe(1); // t = 1,4667 s: todavía no llegó el tercero
    expect(plan[45]).toBe(2); // t = 1,5 s
    expect(plan[59]).toBe(2);
  });

  it("el orden nunca retrocede y los cuadros anteriores a t0 no se pierden", () => {
    const plan = planFrames(frames(9.8, 10.2, 10.3), 10, 11, 30);
    expect(plan[0]).toBe(0); // el último que existía antes de t0
    for (let i = 1; i < plan.length; i++) expect(plan[i]).toBeGreaterThanOrEqual(plan[i - 1]);
  });

  it("si el primer cuadro llega tarde se usa igual desde el inicio", () => {
    expect(planFrames(frames(10.4), 10, 11, 30)[0]).toBe(0);
  });

  it("sin cuadros falla con un mensaje claro", () => {
    expect(() => planFrames([], 0, 1)).toThrow(/ningún cuadro/);
  });

  it("la lista de ffmpeg agrupa repetidos y la duración total es la del video", () => {
    const plan = planFrames(frames(0, 1), 0, 2, 30);
    const text = concatList(plan, ["a.jpg", "b.jpg"], 30);
    const durations = [...text.matchAll(/duration ([\d.]+)/g)].map((m) => Number(m[1]));
    expect(durations.reduce((s, d) => s + d, 0)).toBeCloseTo(2, 5);
    expect(text.split("\n").filter((l) => l.startsWith("file"))).toEqual(["file 'a.jpg'", "file 'b.jpg'", "file 'b.jpg'"]);
  });

  it("escapa comillas y barras de Windows en las rutas", () => {
    const text = concatList([0], ["C:\\Users\\o'brien\\f0.jpg"], 30);
    expect(text).toContain("file 'C:/Users/o'\\''brien/f0.jpg'");
  });
});
