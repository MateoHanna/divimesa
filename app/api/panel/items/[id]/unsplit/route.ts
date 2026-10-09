import { z } from "zod";

import { panelRoute } from "@/lib/panel/api";
import { rpc } from "@/lib/panel/queries";

/** Vuelve a juntar un plato dividido por el cliente, mientras ninguna parte esté pagada ni en pago. */
export const POST = panelRoute({}, async ({ params }) => {
  await rpc("panel_unsplit_item", { p_item_id: z.uuid().parse(params.id) });
});
