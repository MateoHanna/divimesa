import { randomUUID } from "node:crypto";

import { LOGO_MAX_BYTES, sniffImage } from "@/lib/branding";
import { panelRoute } from "@/lib/panel/api";
import { DbError } from "@/lib/panel/queries";
import { getAdminClient } from "@/lib/supabase/server";

const BUCKET = "logos";

async function currentRestaurant() {
  const db = getAdminClient();
  const { data, error } = await db.from("restaurants").select("id,logo_url").order("created_at").limit(1)
    .single<{ id: string; logo_url: string | null }>();
  if (error || !data) throw new DbError("bill_not_found");
  return { db, ...data };
}

/** El archivo viejo se borra al cambiar o quitar el logo (sin que un fallo frene la operación). */
async function removeOld(db: ReturnType<typeof getAdminClient>, url: string | null) {
  const marker = `/${BUCKET}/`;
  const i = url ? url.indexOf(marker) : -1;
  if (!url || i < 0) return;
  await db.storage.from(BUCKET).remove([url.slice(i + marker.length)]).catch(() => undefined);
}

export const POST = panelRoute({}, async ({ req }) => {
  const form = await req.formData().catch(() => null);
  const file = form?.get("logo");
  if (!(file instanceof File)) throw new DbError("logo_missing");
  if (file.size > LOGO_MAX_BYTES) throw new DbError("logo_too_big");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind) throw new DbError("logo_type");

  const { db, id, logo_url } = await currentRestaurant();
  const path = `${id}/${randomUUID()}.${kind.ext}`; // nombre nuevo cada vez: así no queda en caché el logo anterior
  const up = await db.storage.from(BUCKET).upload(path, bytes, { contentType: kind.mime, upsert: false, cacheControl: "31536000" });
  if (up.error) throw new DbError(up.error.message);
  const url = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const res = await db.from("restaurants").update({ logo_url: url }).eq("id", id);
  if (res.error) throw new DbError(res.error.message);
  await removeOld(db, logo_url);
});

export const DELETE = panelRoute({}, async () => {
  const { db, id, logo_url } = await currentRestaurant();
  const res = await db.from("restaurants").update({ logo_url: null }).eq("id", id);
  if (res.error) throw new DbError(res.error.message);
  await removeOld(db, logo_url);
});
