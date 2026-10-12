import { describe, expect, it } from "vitest";

import { formatElapsed, openFor } from "./elapsed";

const MIN = 60000;

describe("formatElapsed", () => {
  it("formatea minutos, horas exactas y horas con minutos", () => {
    expect(formatElapsed(0)).toBe("0 min");
    expect(formatElapsed(59 * MIN + 59000)).toBe("59 min");
    expect(formatElapsed(60 * MIN)).toBe("1 h");
    expect(formatElapsed(100 * MIN)).toBe("1 h 40 min");
    expect(formatElapsed(125 * MIN)).toBe("2 h 5 min");
  });
  it("no devuelve tiempos negativos", () => {
    expect(formatElapsed(-5 * MIN)).toBe("0 min");
  });
});

describe("openFor", () => {
  const now = Date.parse("2026-10-09T21:00:00Z");
  it("arma el texto de la mesa", () => {
    expect(openFor("2026-10-09T19:20:00Z", now)).toBe("Abierta · 1 h 40 min");
  });
  it("ignora fechas inválidas", () => {
    expect(openFor("", now)).toBeNull();
  });
});
