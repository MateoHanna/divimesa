import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BRAND } from "./brand";
import { contrastRatio, readableOn } from "./branding";
import { computeTotals } from "./money";

describe("marca Divimesa", () => {
  it("el escarlata se lee con texto blanco y el texto oscuro se lee sobre blanco", () => {
    expect(readableOn(BRAND.scarlet)).toBe("#ffffff");
    expect(contrastRatio(BRAND.scarlet, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(BRAND.ink, "#ffffff")).toBeGreaterThanOrEqual(12);
  });
  it("el escarlata sobre fondo oscuro se lee en un fondo casi negro", () => {
    expect(contrastRatio(BRAND.scarletOnDark, "#1c1c1e")).toBeGreaterThanOrEqual(4.5);
  });
  it("el enlace de WhatsApp es el acordado", () => {
    expect(BRAND.whatsapp).toBe("https://wa.me/18063006454");
  });
  it("el tiquete de la portada: ₡13 400 de platos con servicio e IVA suman ₡16 482", () => {
    const t = computeTotals(13400, { serviceRate: 0.1, vatRate: 0.13, pricesIncludeTaxes: false });
    expect(t).toEqual({ subtotal: 13400, service: 1340, vat: 1742, total: 16482 });
  });
  it("todo enlace de WhatsApp del código usa el número acordado", () => {
    const root = join(__dirname, "..");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (["node_modules", ".next", ".git", "videos"].includes(name)) continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(tsx?|mdx?|json)$/.test(name) && !name.endsWith("brand.test.ts") && name !== "package-lock.json") files.push(full);
      }
    };
    for (const d of ["app", "components", "lib"]) walk(join(root, d));
    const links = files.flatMap((f) => [...readFileSync(f, "utf8").matchAll(/wa\.me\/(\d+)/g)].map((m) => ({ f, n: m[1] })));
    expect(links.length).toBeGreaterThan(0);
    expect(links.filter((l) => l.n !== "18063006454")).toEqual([]);
  });
  it("los textos públicos no dicen \"contrato\"", () => {
    const home = readFileSync(join(__dirname, "..", "app", "page.tsx"), "utf8");
    expect(home).not.toMatch(/contrato/i);
    expect(home).toContain("Piloto gratis de 2 semanas · Sin instalación · Sin plazo mínimo");
    expect(home).toContain("Si no le sirve, lo quitamos.");
  });
});
