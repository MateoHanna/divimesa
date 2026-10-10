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
});
