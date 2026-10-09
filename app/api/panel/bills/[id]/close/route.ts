import { z } from "zod";

import { panelRoute } from "@/lib/panel/api";
import { rpc } from "@/lib/panel/queries";

export const POST = panelRoute({}, async ({ params }) => {
  await rpc("panel_close_bill", { p_bill_id: z.uuid().parse(params.id) });
});
