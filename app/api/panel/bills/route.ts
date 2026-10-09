import { z } from "zod";

import { panelRoute } from "@/lib/panel/api";
import { rpc } from "@/lib/panel/queries";

export const POST = panelRoute({ body: z.object({ tableId: z.uuid() }) }, async ({ body }) => {
  const billId = await rpc<string>("panel_open_bill", { p_table_id: body.tableId });
  return { billId };
});
