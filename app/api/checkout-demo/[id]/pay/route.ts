import { z } from "zod";

import { getAppUrl } from "@/lib/app-url";
import { clientRoute, HttpError, readBody } from "@/lib/client/api";
import { getServerEnv } from "@/lib/env";
import { runMockCheckout } from "@/lib/payments/mock-checkout";
import { rpc } from "@/lib/panel/queries";
import { getAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
// 1,5 s de espera simulada + el webhook. La función espera a que el webhook termine antes de responder.
export const maxDuration = 30;

/** Solo el generador de video (scripts/demo-video) lo define, para acortar la espera simulada. Nunca en producción. */
function demoDelayMs(): number | undefined {
  if (process.env.VERCEL_ENV === "production") return undefined;
  const n = Number(process.env.DEMO_CHECKOUT_DELAY_MS);
  return Number.isFinite(n) && n >= 0 && n <= 1500 ? n : undefined;
}

const schema = z.object({ outcome: z.enum(["paid", "failed"]).default("paid") });

/** "Pagar" del checkout de la demo. Hace el papel de la pasarela: manda el webhook firmado y espera su respuesta. */
export const POST = clientRoute(async (req, params) => {
  const id = z.uuid().parse(params.id);
  const { outcome } = await readBody(req, schema);

  const receipt = await rpc<{ status: string; show_decline_demo: boolean; token: string }>("payment_receipt", { p_payment_id: id });
  if (receipt.status !== "pending") {
    throw new HttpError(409, "not_pending", "Este pago ya no está activo.", { status: receipt.status, token: receipt.token });
  }
  if (outcome === "failed" && !receipt.show_decline_demo) {
    throw new HttpError(403, "decline_disabled", "Esta opción no está activa.");
  }

  const { data } = await getAdminClient().from("payments").select("provider_ref").eq("id", id).single<{ provider_ref: string | null }>();
  if (!data?.provider_ref) throw new HttpError(409, "no_provider_ref", "Este pago no tiene checkout.");

  try {
    await runMockCheckout({ providerRef: data.provider_ref, outcome, secret: getServerEnv().MOCK_WEBHOOK_SECRET, appUrl: getAppUrl(), delayMs: demoDelayMs() });
  } catch (e) {
    console.error("[checkout-demo] el webhook falló:", e);
    throw new HttpError(502, "webhook_failed", "No se pudo confirmar el pago. Intente de nuevo.");
  }
  return { outcome, token: receipt.token };
});
