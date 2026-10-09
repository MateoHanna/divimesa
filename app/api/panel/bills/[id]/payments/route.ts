import { z } from "zod";

import { panelRoute } from "@/lib/panel/api";
import { rpc } from "@/lib/panel/queries";

const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("amount"), method: z.enum(["terminal", "cash"]), amount: z.number().int().min(1).max(100_000_000) }),
  z.object({ kind: z.literal("items"), method: z.enum(["terminal", "cash"]), itemIds: z.array(z.uuid()).min(1).max(100) }),
]);

export const POST = panelRoute({ body: schema }, async ({ body, params }) => {
  const result = await rpc<Record<string, unknown>>("record_panel_payment", {
    p_bill_id: z.uuid().parse(params.id),
    p_method: body.method,
    p_kind: body.kind,
    p_amount: body.kind === "amount" ? body.amount : null,
    p_item_ids: body.kind === "items" ? body.itemIds : null,
  });
  return { payment: result };
});
