import { describe, expect, it } from "vitest";
import { formatSinpeNumber, plainAmount, plainSinpeNumber } from "./sinpe";

describe("texto para copiar", () => {
  it("el número se copia solo con dígitos", () => {
    expect(plainSinpeNumber("88887777")).toBe("88887777");
    expect(plainSinpeNumber("8888-7777")).toBe("88887777");
    expect(plainSinpeNumber(formatSinpeNumber("88887777"))).toBe("88887777");
  });
  it("el monto se copia sin símbolo ni separadores", () => {
    expect(plainAmount(27500)).toBe("27500");
    expect(plainAmount(27500.4)).toBe("27500");
  });
});
