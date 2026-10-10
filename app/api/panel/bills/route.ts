import { z } from "zod";

import { panelRoute } from "@/lib/panel/api";
import { rpc } from "@/lib/panel/queries";

/** Abre la cuenta de una mesa. Con `total`, la cuenta es de solo el total (modo piloto). */
export const POST = panelRoute(
  { body: z.object({ tableId: z.uuid(), total: z.number().int().min(1).max(100_000_000).optional() }) },
  async ({ body }) => {
    const billId = body.total !== undefined
      ? await rpc<string>("panel_open_bill_total", { p_table_id: body.tableId, p_total: body.total })
      : await rpc<string>("panel_open_bill", { p_table_id: body.tableId });
    return { billId };
  },
);
