import { describe, expect, it } from "vitest";

import { parseArgs, slugify, validateNewRestaurant } from "./new-restaurant.mjs";

const ok = { name: "Soda La Esquina", tables: 12, mode: "total", sinpe: "8888-7777", holder: "Soda La Esquina SA", color: "#0f766e" };

describe("slugify", () => {
  it("quita tildes y signos", () => {
    expect(slugify("Soda La Esquina")).toBe("soda-la-esquina");
    expect(slugify("  Café & Más: ¡Ñandú!  ")).toBe("cafe-mas-nandu");
    expect(slugify("x".repeat(80)).length).toBeLessThanOrEqual(40);
  });
});

describe("validateNewRestaurant", () => {
  it("acepta datos buenos y los normaliza", () => {
    const r = validateNewRestaurant(ok);
    expect(r).toEqual({ ok: true, value: { name: "Soda La Esquina", slug: "soda-la-esquina", color: "#0F766E", tables: 12, mode: "total", sinpe: "88887777", holder: "Soda La Esquina SA" } });
  });
  it("modo total exige SINPE", () => {
    const r = validateNewRestaurant({ ...ok, sinpe: "", holder: "" });
    expect(r.ok).toBe(false);
  });
  it("modo por platos puede ir sin SINPE", () => {
    expect(validateNewRestaurant({ ...ok, mode: "items", sinpe: "", holder: "" }).ok).toBe(true);
  });
  it("SINPE y titular van juntos", () => {
    expect(validateNewRestaurant({ ...ok, mode: "items", holder: "" }).ok).toBe(false);
  });
  it("rechaza datos malos", () => {
    for (const bad of [
      { name: "" }, { slug: "Demo" }, { slug: "-malo" }, { color: "rojo" }, { tables: 0 }, { tables: 201 }, { tables: 1.5 },
      { mode: "otro" }, { sinpe: "1234" },
    ]) {
      expect(validateNewRestaurant({ ...ok, ...bad }).ok, JSON.stringify(bad)).toBe(false);
    }
  });
  it("«demo» queda reservado", () => {
    expect(validateNewRestaurant({ ...ok, name: "Demo" }).ok).toBe(false);
  });
});

describe("parseArgs", () => {
  it("lee valores y banderas", () => {
    expect(parseArgs(["--nombre", "Soda", "--simular", "--mesas", "5"])).toEqual({ nombre: "Soda", simular: true, mesas: "5" });
  });
});
