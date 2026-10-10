import { z } from "zod";

import { panelRoute } from "@/lib/panel/api";
import { rpc } from "@/lib/panel/queries";

/** "No llegó": el SINPE no apareció en el banco. */
export const POST = panelRoute({}, async ({ params }) => {
  const payment = await rpc<Record<string, unknown>>("panel_reject_sinpe", { p_payment_id: z.uuid().parse(params.id) });
  return { payment };
});
