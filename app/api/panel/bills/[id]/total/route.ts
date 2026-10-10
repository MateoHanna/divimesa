import { z } from "zod";

import { panelRoute } from "@/lib/panel/api";
import { rpc } from "@/lib/panel/queries";

/** Corrige el total de una cuenta de solo el total (no se puede con un SINPE por confirmar). */
export const PATCH = panelRoute(
  { body: z.object({ total: z.number().int().min(1).max(100_000_000) }) },
  async ({ body, params }) => {
    await rpc("panel_set_total", { p_bill_id: z.uuid().parse(params.id), p_total: body.total });
  },
);
