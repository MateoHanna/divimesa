import { describe, expect, it, vi } from "vitest";

import { toClientState } from "../client/state";
import { toReceipt } from "../client/receipt";
import { createMockProvider, MOCK_SIGNATURE_HEADER, signMockBody } from "./mock";
import { runMockCheckout } from "./mock-checkout";
import { processWebhook } from "./webhook";

const secret = "0123456789abcdef-secret";
const provider = createMockProvider(secret);

function hook(status: "paid" | "failed", signSecret = secret, ref = "mock_p1") {
  const body = JSON.stringify({ providerRef: ref, status });
  return new Request("http://x/api/webhooks/mock", { method: "POST", body, headers: { [MOCK_SIGNATURE_HEADER]: signMockBody(signSecret, body) } });
}

describe("processWebhook", () => {
  it("paid llama a confirm_payment con la referencia", async () => {
    const rpc = vi.fn().mockResolvedValue({ already: false, paid_in_full: true });
    const r = await processWebhook(provider, hook("paid"), rpc);
    expect(rpc).toHaveBeenCalledWith("confirm_payment", { p_provider_ref: "mock_p1" });
    expect(r).toEqual({ status: 200, body: { ok: true, result: "paid", already: false, paidInFull: true } });
  });

  it("failed llama a fail_payment", async () => {
    const rpc = vi.fn().mockResolvedValue({ already: false });
    const r = await processWebhook(provider, hook("failed"), rpc);
    expect(rpc).toHaveBeenCalledWith("fail_payment", { p_provider_ref: "mock_p1" });
    expect(r.status).toBe(200);
  });

  it("el mismo aviso dos veces: la segunda respuesta marca already y el SQL no descuenta de nuevo", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ already: false }).mockResolvedValueOnce({ already: true });
    const a = await processWebhook(provider, hook("paid"), rpc);
    const b = await processWebhook(provider, hook("paid"), rpc);
    expect(a.body.already).toBe(false);
    expect(b.body.already).toBe(true);
    expect(b.status).toBe(200);
  });

  it("firma inválida: 401 y no toca la base", async () => {
    const rpc = vi.fn();
    const r = await processWebhook(provider, hook("paid", "otro-secreto-distinto"), rpc);
    expect(r.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sin firma: 401", async () => {
    const rpc = vi.fn();
    const req = new Request("http://x", { method: "POST", body: JSON.stringify({ providerRef: "a", status: "paid" }) });
    expect((await processWebhook(provider, req, rpc)).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("cuerpo firmado pero inválido: 400", async () => {
    const body = JSON.stringify({ providerRef: 5, status: "paid" });
    const req = new Request("http://x", { method: "POST", body, headers: { [MOCK_SIGNATURE_HEADER]: signMockBody(secret, body) } });
    expect((await processWebhook(provider, req, vi.fn())).status).toBe(400);
  });

  it("pago desconocido: 404", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("payment_not_found"));
    expect((await processWebhook(provider, hook("paid"), rpc)).status).toBe(404);
  });

  it("otro error de la base se propaga", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(processWebhook(provider, hook("paid"), rpc)).rejects.toThrow("boom");
  });
});

describe("runMockCheckout", () => {
  it("espera, firma el cuerpo y no termina hasta que el webhook responde", async () => {
    const order: string[] = [];
    const sleep = vi.fn(async () => { order.push("sleep"); });
    const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      order.push("fetch");
      const headers = init?.headers as Record<string, string>;
      expect(headers[MOCK_SIGNATURE_HEADER]).toBe(signMockBody(secret, init?.body as string));
      await Promise.resolve();
      order.push("webhook-listo");
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    await runMockCheckout({ providerRef: "mock_p1", outcome: "paid", secret, appUrl: "https://demo.example", sleep, fetchFn });
    expect(sleep).toHaveBeenCalledWith(1500);
    expect(order).toEqual(["sleep", "fetch", "webhook-listo"]);
    expect((fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("https://demo.example/api/webhooks/mock");
  });

  it("lanza si el webhook no responde bien", async () => {
    const fetchFn = vi.fn(async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
    await expect(runMockCheckout({ providerRef: "x", outcome: "failed", secret, appUrl: "https://a", sleep: async () => {}, fetchFn }))
      .rejects.toThrow("webhook_failed_500");
  });
});

describe("estado terminado y comprobante", () => {
  const base = { table_number: 4, server_time: "2026-10-09T00:00:00Z", restaurant: { name: "R", primary_color: "#0f766e" } };
  it("cuenta cerrada sin cobrar el saldo", () => {
    const s = toClientState({ ...base, view: "finished", bill: { id: "b", status: "closed", outcome: "closed" } });
    expect(s.outcome).toBe("closed");
  });
  it("cuenta pagada (incluso ya liberada)", () => {
    expect(toClientState({ ...base, view: "finished", bill: { id: "b", status: "closed", outcome: "paid" } }).outcome).toBe("paid");
    expect(toClientState({ ...base, view: "finished", bill: { id: "b", status: "paid" } }).outcome).toBe("paid");
  });
  it("abierta no tiene desenlace", () => {
    expect(toClientState({ ...base, view: "no_bill", bill: null }).outcome).toBeNull();
  });
  it("comprobante con y sin correo", () => {
    const raw = { id: "p", status: "paid" as const, amount: 5000, tip: 250, method: "card", paid_at: null, token: "t", table_number: 4,
      restaurant: "R", primary_color: "#0f766e", show_decline_demo: false, invoice_email: " a@b.cr " };
    expect(toReceipt(raw).invoiceEmail).toBe("a@b.cr");
    expect(toReceipt({ ...raw, invoice_email: null }).invoiceEmail).toBeNull();
    expect(toReceipt({ ...raw, invoice_email: "  " }).invoiceEmail).toBeNull();
  });
});
