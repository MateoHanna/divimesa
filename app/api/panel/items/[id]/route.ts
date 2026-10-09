import { z } from "zod";

import { panelRoute } from "@/lib/panel/api";
import { rpc } from "@/lib/panel/queries";

export const PATCH = panelRoute(
  { body: z.object({ price: z.number().int().min(1).max(10_000_000) }) },
  async ({ body, params }) => {
    await rpc("panel_set_price", { p_item_id: z.uuid().parse(params.id), p_price: body.price });
  },
);

export const DELETE = panelRoute({}, async ({ params }) => {
  await rpc("panel_void_item", { p_item_id: z.uuid().parse(params.id) });
});
