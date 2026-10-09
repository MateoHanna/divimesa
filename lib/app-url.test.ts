import { afterEach, describe, expect, it, vi } from "vitest";

import { getAppUrl, tableUrl } from "./app-url";

const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz012345";

afterEach(() => vi.unstubAllEnvs());

describe("getAppUrl", () => {
  it("devuelve el origen de APP_URL sin barra final", () => {
    vi.stubEnv("APP_URL", "https://demo-qr-steel.vercel.app/");
    expect(getAppUrl()).toBe("https://demo-qr-steel.vercel.app");
  });

  it("ignora VERCEL_URL y VERCEL_BRANCH_URL: los QR nunca apuntan a un deploy específico", () => {
    vi.stubEnv("APP_URL", "https://demo-qr-steel.vercel.app");
    vi.stubEnv("VERCEL_URL", "demo-qr-abc123-mateohanna.vercel.app");
    vi.stubEnv("VERCEL_BRANCH_URL", "demo-qr-git-main-mateohanna.vercel.app");
    expect(getAppUrl()).toBe("https://demo-qr-steel.vercel.app");
  });

  it("falla si APP_URL no está definida, aunque exista VERCEL_URL", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("VERCEL_URL", "demo-qr-abc123-mateohanna.vercel.app");
    expect(() => getAppUrl()).toThrow(/APP_URL/);
  });

  it("rechaza valores que no son un origen http(s) limpio", () => {
    for (const bad of ["demo-qr-steel.vercel.app", "ftp://x.com", "https://x.com/panel", "https://x.com?a=1"]) {
      vi.stubEnv("APP_URL", bad);
      expect(() => getAppUrl(), bad).toThrow(/APP_URL/);
    }
  });

  it("en producción de Vercel exige https", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("APP_URL", "http://demo-qr-steel.vercel.app");
    expect(() => getAppUrl()).toThrow(/https/);
  });

  it("en local permite http://localhost", () => {
    vi.stubEnv("APP_URL", "http://localhost:3000");
    expect(getAppUrl()).toBe("http://localhost:3000");
  });
});

describe("tableUrl", () => {
  it("arma la URL del QR con el dominio de APP_URL", () => {
    vi.stubEnv("APP_URL", "https://demo-qr-steel.vercel.app");
    expect(tableUrl(TOKEN)).toBe(`https://demo-qr-steel.vercel.app/m/${TOKEN}`);
  });

  it("rechaza tokens con caracteres que no son base64url", () => {
    vi.stubEnv("APP_URL", "https://demo-qr-steel.vercel.app");
    expect(() => tableUrl("../panel")).toThrow(RangeError);
    expect(() => tableUrl("")).toThrow(RangeError);
  });
});
