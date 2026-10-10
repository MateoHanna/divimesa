import { z } from "zod";

import { panelRoute } from "@/lib/panel/api";
import { DbError } from "@/lib/panel/queries";
import { getAdminClient } from "@/lib/supabase/server";

/** Ajustes de demo del restaurante. Hoy solo el interruptor "Simular rechazo" del checkout. */
export const PATCH = panelRoute(
  { body: z.object({ showDeclineDemo: z.boolean() }) },
  async ({ body }) => {
    const db = getAdminClient();
    const { data, error } = await db.from("restaurants").select("id").order("created_at").limit(1).single<{ id: string }>();
    if (error || !data) throw new DbError("bill_not_found");
    const res = await db.from("restaurants").update({ show_decline_demo: body.showDeclineDemo }).eq("id", data.id);
    if (res.error) throw new DbError(res.error.message);
  },
);
