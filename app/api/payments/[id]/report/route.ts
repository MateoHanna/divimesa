import { z } from "zod";

import { clientRoute, getSession, readBody } from "@/lib/client/api";
import { loadClientState } from "@/lib/client/queries";
import { rpc } from "@/lib/panel/queries";

export const dynamic = "force-dynamic";

const schema = z.object({ payerName: z.string().max(120).optional() });

/** "Ya hice el SINPE": el pago pasa a "por confirmar" y el salonero lo ve en su panel. */
export const POST = clientRoute(async (req, params) => {
  const { payerName } = await readBody(req, schema);
  const session = getSession(req);
  const r = await rpc<{ status: string; token: string }>("client_report_sinpe", {
    p_payment_id: z.uuid().parse(params.id), p_session: session, p_payer_name: payerName ?? null,
  });
  return { status: r.status, state: await loadClientState(r.token, session) };
});
