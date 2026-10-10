import type { PaymentProvider } from "./types";

export type RpcFn = (name: string, args: Record<string, unknown>) => Promise<unknown>;
export interface WebhookResult { status: number; body: Record<string, unknown> }

/**
 * Procesa un webhook de cualquier proveedor: valida la firma y aplica el resultado en la base.
 * Es idempotente porque las funciones SQL lo son: el mismo aviso dos veces no descuenta dos veces.
 */
export async function processWebhook(provider: PaymentProvider, req: Request, rpc: RpcFn): Promise<WebhookResult> {
  let event: { providerRef: string; status: "paid" | "failed" };
  try {
    event = await provider.parseWebhook(req);
  } catch (e) {
    const bad = e instanceof Error && e.message === "invalid_body";
    return { status: bad ? 400 : 401, body: { ok: false, code: bad ? "invalid_body" : "invalid_signature" } };
  }
  try {
    const r = (await rpc(event.status === "paid" ? "confirm_payment" : "fail_payment", { p_provider_ref: event.providerRef })) as
      | { already?: boolean; paid_in_full?: boolean; overpaid?: number }
      | null;
    return { status: 200, body: { ok: true, result: event.status, already: !!r?.already, paidInFull: !!r?.paid_in_full } };
  } catch (e) {
    if (e instanceof Error && e.message.includes("payment_not_found")) {
      return { status: 404, body: { ok: false, code: "payment_not_found" } };
    }
    throw e;
  }
}
