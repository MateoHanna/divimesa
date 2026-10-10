import { describe, expect, it } from "vitest";

import { brandingSchema, brandVars, contrastRatio, initialOf, normalizeHex, readableOn, sniffImage } from "./branding";

describe("colores de la marca", () => {
  it("normaliza #rgb y mayúsculas, y rechaza lo demás", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(normalizeHex(" #0F766E ")).toBe("#0f766e");
    for (const bad of ["", "0f766e", "#12", "#12345", "#gggggg", "rgb(1,2,3)", "red"]) expect(normalizeHex(bad)).toBeNull();
  });

  it("elige texto blanco sobre fondos oscuros y oscuro sobre claros", () => {
    expect(readableOn("#0f766e")).toBe("#ffffff");
    expect(readableOn("#111827")).toBe("#ffffff");
    expect(readableOn("#facc15")).toBe("#111111");
    expect(readableOn("#ffffff")).toBe("#111111");
  });

  it("el texto elegido siempre tiene contraste legible (4,5 o más) con los colores sugeridos", () => {
    for (const c of ["#0f766e", "#15803d", "#1d4ed8", "#6d28d9", "#be185d", "#b91c1c", "#c2410c", "#a16207", "#111827"]) {
      expect(contrastRatio(c, readableOn(c))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("el texto cambia solo a oscuro con colores claros y nunca baja de 4,5 de contraste", () => {
    for (const c of ["#fde047", "#a7f3d0", "#fbcfe8", "#e5e7eb", "#bae6fd", "#ffffff"]) expect(readableOn(c)).toBe("#111111");
    const steps = [0, 51, 102, 153, 204, 255];
    let worst = 21;
    for (const r of steps) for (const g of steps) for (const b of steps) {
      const hex = "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
      worst = Math.min(worst, contrastRatio(hex, readableOn(hex)));
    }
    expect(worst).toBeGreaterThanOrEqual(4.5);
  });

  it("brandVars cae al escarlata de Divimesa por defecto si el color no sirve", () => {
    expect(brandVars("nada")["--brand"]).toBe("#D91E18");
    expect(brandVars("#FACC15")).toEqual({ "--brand": "#facc15", "--primary-foreground": "#111111" });
  });

  it("la inicial salta símbolos y espacios", () => {
    expect(initialOf("  La Divina Comida")).toBe("L");
    expect(initialOf("¡Ñandú!")).toBe("Ñ");
    expect(initialOf("   ")).toBe("R");
  });
});

describe("datos del restaurante", () => {
  it("acepta nombre y color válidos", () => {
    expect(brandingSchema.parse({ name: "  Soda Tapia ", primaryColor: "#C2410C" })).toEqual({ name: "Soda Tapia", primaryColor: "#c2410c" });
  });
  it("rechaza nombre vacío o muy largo y color inválido", () => {
    expect(brandingSchema.safeParse({ name: "  ", primaryColor: "#000000" }).success).toBe(false);
    expect(brandingSchema.safeParse({ name: "x".repeat(81), primaryColor: "#000000" }).success).toBe(false);
    expect(brandingSchema.safeParse({ name: "Soda", primaryColor: "azul" }).success).toBe(false);
  });
});

describe("tipo de imagen del logo", () => {
  const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);
  it("reconoce PNG, JPG y WebP por sus bytes", () => {
    expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47))?.mime).toBe("image/png");
    expect(sniffImage(bytes(0xff, 0xd8, 0xff))?.ext).toBe("jpg");
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0]);
    expect(sniffImage(webp)?.mime).toBe("image/webp");
  });
  it("rechaza SVG, HTML y archivos vacíos aunque digan ser imagen", () => {
    expect(sniffImage(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toBeNull();
    expect(sniffImage(new TextEncoder().encode("<html><script>alert(1)</script>"))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });
});
