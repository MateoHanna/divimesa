import { z } from "zod";

import { panelRoute } from "@/lib/panel/api";
import { rpc } from "@/lib/panel/queries";

const schema = z.object({ menuItemId: z.uuid(), quantity: z.number().int().min(1).max(20) });

export const POST = panelRoute({ body: schema }, async ({ body, params }) => {
  await rpc("panel_add_items", { p_bill_id: z.uuid().parse(params.id), p_menu_item_id: body.menuItemId, p_quantity: body.quantity });
});
