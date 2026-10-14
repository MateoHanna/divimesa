import { z } from "zod";

import { panelRoute } from "@/lib/panel/api";
import { rpc } from "@/lib/panel/queries";

/** "Recibido": el salonero vio el SINPE en el banco. "Cobrado": cobró con el datáfono que pidió el cliente. */
export const POST = panelRoute({}, async ({ params }) => {
  const payment = await rpc<Record<string, unknown>>("panel_confirm_sinpe", { p_payment_id: z.uuid().parse(params.id) });
  return { payment };
});
