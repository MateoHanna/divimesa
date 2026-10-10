import { brandingSchema } from "@/lib/branding";
import { panelRoute } from "@/lib/panel/api";
import { DbError } from "@/lib/panel/queries";
import { getAdminClient } from "@/lib/supabase/server";

/** Nombre y color del restaurante. */
export const PATCH = panelRoute({ body: brandingSchema }, async ({ body }) => {
  const db = getAdminClient();
  const { data, error } = await db.from("restaurants").select("id").order("created_at").limit(1).single<{ id: string }>();
  if (error || !data) throw new DbError("bill_not_found");
  const res = await db.from("restaurants").update({ name: body.name, primary_color: body.primaryColor }).eq("id", data.id);
  if (res.error) throw new DbError(res.error.message);
});
