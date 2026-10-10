import { MOCK_SIGNATURE_HEADER, signMockBody } from "./mock";

export interface MockCheckoutInput {
  providerRef: string;
  outcome: "paid" | "failed";
  secret: string;
  /** Dominio estable de la app (APP_URL). El servidor se llama a sí mismo como lo haría una pasarela real. */
  appUrl: string;
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  fetchFn?: typeof fetch;
}

/**
 * Simula a la pasarela: espera un poco y manda el webhook firmado. Termina recién cuando el webhook
 * respondió, para que la función de Vercel no se corte con el pago a medias. Lanza si el webhook falla.
 */
export async function runMockCheckout(o: MockCheckoutInput): Promise<void> {
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const doFetch = o.fetchFn ?? fetch;
  await sleep(o.delayMs ?? 1500);
  const body = JSON.stringify({ providerRef: o.providerRef, status: o.outcome });
  const res = await doFetch(`${o.appUrl}/api/webhooks/mock`, {
    method: "POST",
    headers: { "Content-Type": "application/json", [MOCK_SIGNATURE_HEADER]: signMockBody(o.secret, body) },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`webhook_failed_${res.status}`);
}
