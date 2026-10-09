import { afterEach, describe, expect, it, vi } from "vitest";

const VALID = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "a".repeat(30),
  SUPABASE_SERVICE_ROLE_KEY: "b".repeat(30),
  PANEL_PIN: "1234",
  PAYMENT_PROVIDER: "mock",
  MOCK_WEBHOOK_SECRET: "c".repeat(20),
};

async function loadEnv() {
  vi.resetModules();
  return (await import("@/lib/env")).getServerEnv;
}

afterEach(() => vi.unstubAllEnvs());

describe("getServerEnv", () => {
  it("acepta una configuración completa", async () => {
    for (const [k, v] of Object.entries(VALID)) vi.stubEnv(k, v);
    const getServerEnv = await loadEnv();
    expect(getServerEnv().PAYMENT_PROVIDER).toBe("mock");
  });

  it("falla y nombra las variables que faltan", async () => {
    for (const [k, v] of Object.entries(VALID)) vi.stubEnv(k, v);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const getServerEnv = await loadEnv();
    expect(() => getServerEnv()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});
