import { getServerEnv } from "@/lib/env";

import { createMockProvider } from "./mock";
import type { PaymentProvider } from "./types";

/** Proveedor activo según PAYMENT_PROVIDER. Para sumar uno real, agréguelo aquí y en el enum de lib/env.ts. */
export function getPaymentProvider(): PaymentProvider {
  const env = getServerEnv();
  switch (env.PAYMENT_PROVIDER) {
    case "mock":
      return createMockProvider(env.MOCK_WEBHOOK_SECRET);
  }
}

export type { PaymentProvider } from "./types";
