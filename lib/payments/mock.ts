import { createHmac, timingSafeEqual } from "node:crypto";

import type { PaymentProvider } from "./types";

export const MOCK_SIGNATURE_HEADER = "x-mock-signature";

export function signMockBody(secret: string, rawBody: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

/** Proveedor simulado de la demo: manda al checkout de mentira y firma sus webhooks con MOCK_WEBHOOK_SECRET. */
export function createMockProvider(secret: string): PaymentProvider {
  return {
    id: "mock",
    async createCheckout({ paymentId }) {
      return { redirectUrl: `/checkout-demo/${paymentId}`, providerRef: `mock_${paymentId}` };
    },
    async parseWebhook(req) {
      const raw = await req.text();
      const given = Buffer.from(req.headers.get(MOCK_SIGNATURE_HEADER) ?? "", "hex");
      const expected = Buffer.from(signMockBody(secret, raw), "hex");
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new Error("invalid_signature");
      const body = JSON.parse(raw) as { providerRef?: unknown; status?: unknown };
      if (typeof body.providerRef !== "string" || (body.status !== "paid" && body.status !== "failed")) {
        throw new Error("invalid_body");
      }
      return { providerRef: body.providerRef, status: body.status };
    },
  };
}
