import { z } from "zod";

import { clientRoute, getSession, HttpError, readBody, requireToken } from "@/lib/client/api";
import { loadClientState } from "@/lib/client/queries";
import { tableUrl } from "@/lib/app-url";
import { getPaymentProvider } from "@/lib/payments";
import { DbError, rpc } from "@/lib/panel/queries";
import { getAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const invoice = z.object({
  name: z.string().trim().max(120).optional(),
  idType: z.enum(["fisica", "juridica"]).optional(),
  idNumber: z.string().trim().regex(/^\d{9,12}$/, "La cédula debe tener entre 9 y 12 dígitos.").optional().or(z.literal("")),
  email: z.string().trim().max(120).pipe(z.email()).optional().or(z.literal("")),
});

const schema = z.object({
  token: z.string(),
  mode: z.enum(["all", "items", "equal", "amount"]),
  /** Solo en mode "amount" (monto libre): colones enteros. */
  amount: z.number().int().min(1).max(100_000_000).optional(),
  itemIds: z.array(z.uuid()).max(100).optional(),
  method: z.enum(["card", "apple_pay", "google_pay", "sinpe"]),
  tip: z.discriminatedUnion("type", [
    z.object({ type: z.literal("percent"), value: z.number().int().min(0).max(100) }),
    z.object({ type: z.literal("amount"), value: z.number().int().min(0).max(1_000_000) }),
  ]),
  invoice: invoice.optional(),
});

/**
 * Crea un pago pendiente. El monto lo calcula la base de datos (nunca el navegador), después se pide el
 * checkout al proveedor activo y se guarda su referencia.
 */
export const POST = clientRoute(async (req) => {
  const body = await readBody(req, schema);
  const token = requireToken(body.token);
  const session = getSession(req);
  const provider = getPaymentProvider();

  const created = await rpc<{
    ok: boolean; code?: string; unavailable?: { id: string; reason: string }[];
    payment_id?: string; amount?: number; tip?: number; expires_at?: string; reference_code?: string;
  }>("client_create_payment", {
    p_token: token, p_session: session, p_mode: body.mode, p_item_ids: body.itemIds ?? null, p_method: body.method,
    p_tip_type: body.tip.type, p_tip_value: body.tip.value, p_provider: provider.id, p_amount: body.amount ?? null,
    p_invoice: body.invoice
      ? { name: body.invoice.name ?? "", id_type: body.invoice.idType ?? "", id_number: body.invoice.idNumber ?? "", email: body.invoice.email ?? "" }
      : null,
  });

  if (!created.ok || !created.payment_id) {
    throw new HttpError(409, created.code ?? "items_unavailable",
      "Algunos platos ya no están disponibles. Revise su selección.",
      { unavailable: created.unavailable ?? [], state: await loadClientState(token, session) });
  }

  const paymentId = created.payment_id;

  // SINPE Móvil: no hay pasarela. El cliente transfiere directo al restaurante y la pantalla de instrucciones
  // sale del estado de la mesa (my_sinpe). Divimesa no recibe dinero.
  if (body.method === "sinpe") {
    return {
      paymentId, amount: created.amount, tip: created.tip, code: created.reference_code,
      state: await loadClientState(token, session),
    };
  }

  try {
    const checkout = await provider.createCheckout({
      paymentId, amount: created.amount ?? 0, currency: "CRC", description: "Pago de cuenta en la mesa",
      returnUrl: tableUrl(token),
    });
    const { error } = await getAdminClient().from("payments").update({ provider_ref: checkout.providerRef }).eq("id", paymentId);
    if (error) throw new DbError(error.message);
    return { paymentId, amount: created.amount, tip: created.tip, expiresAt: created.expires_at, redirectUrl: checkout.redirectUrl };
  } catch (e) {
    // Si el proveedor falla, no queda un pago pendiente apartando saldo.
    if (session) await rpc("client_cancel_payment", { p_payment_id: paymentId, p_session: session }).catch(() => undefined);
    throw e;
  }
});
