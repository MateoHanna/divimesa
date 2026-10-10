import { z } from "zod";

import { panelRoute } from "@/lib/panel/api";
import { DbError, panelRestaurantId } from "@/lib/panel/queries";
import { normalizeSinpeHolder, normalizeSinpeNumber } from "@/lib/panel/sinpe";
import { getAdminClient } from "@/lib/supabase/server";

const schema = z.object({
  showDeclineDemo: z.boolean().optional(),
  billMode: z.enum(["items", "total"]).optional(),
  sinpeNumber: z.string().max(30).optional(),
  sinpeHolder: z.string().max(120).optional(),
});

/** Ajustes del restaurante: interruptor de la demo, modo de cuenta y datos del SINPE Móvil. */
export const PATCH = panelRoute({ body: schema }, async ({ body }) => {
  const db = getAdminClient();
  const id = await panelRestaurantId();
  const { data: cur, error } = await db.from("restaurants").select("is_demo,bill_mode,sinpe_number,sinpe_holder").eq("id", id)
    .single<{ is_demo: boolean; bill_mode: "items" | "total"; sinpe_number: string | null; sinpe_holder: string | null }>();
  if (error || !cur) throw new DbError("bill_not_found");

  const update: Record<string, unknown> = {};
  if (body.showDeclineDemo !== undefined) update.show_decline_demo = body.showDeclineDemo;
  if (body.billMode !== undefined) update.bill_mode = body.billMode;
  // En la demo el SINPE es siempre el número de prueba: no se guarda ninguno.
  if (!cur.is_demo) {
    if (body.sinpeNumber !== undefined) update.sinpe_number = normalizeSinpeNumber(body.sinpeNumber);
    if (body.sinpeHolder !== undefined) update.sinpe_holder = normalizeSinpeHolder(body.sinpeHolder);
    const mode = (update.bill_mode as string | undefined) ?? cur.bill_mode;
    const number = "sinpe_number" in update ? update.sinpe_number : cur.sinpe_number;
    const holder = "sinpe_holder" in update ? update.sinpe_holder : cur.sinpe_holder;
    if (mode === "total" && (!number || !holder)) throw new DbError("sinpe_not_configured");
  }
  if (Object.keys(update).length === 0) return;

  const res = await db.from("restaurants").update(update).eq("id", id);
  if (res.error) throw new DbError(res.error.message.includes("restaurants_total_needs_sinpe") ? "sinpe_not_configured" : res.error.message);
});
