import { describe, expect, it } from "vitest";
import { BRAND } from "./brand";
import { contrastRatio, readableOn } from "./branding";

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
    expect(BRAND.whatsapp).toBe("https://wa.me/50671731226");
  });
});
