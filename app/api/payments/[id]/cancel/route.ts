import { z } from "zod";

import { clientRoute, getSession } from "@/lib/client/api";
import { rpc } from "@/lib/panel/queries";

export const dynamic = "force-dynamic";

/** "Volver" del checkout: cancela el pago pendiente propio y suelta lo apartado. */
export const POST = clientRoute(async (req, params) => {
  const r = await rpc<{ status: string; token: string }>("client_cancel_payment", {
    p_payment_id: z.uuid().parse(params.id), p_session: getSession(req),
  });
  return { status: r.status, token: r.token };
});
