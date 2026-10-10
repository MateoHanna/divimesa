import { createHmac } from "node:crypto";

import { DbError, rpc } from "@/lib/panel/queries";

/** IP de quien hace la visita (Vercel pone la real primero en x-forwarded-for). */
export function ipFromRequest(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || req.headers.get("x-real-ip")?.trim() || "desconocida";
}

/** Hash de la IP: en la base nunca queda la IP, solo esto. Se firma con un secreto del servidor. */
export function hashIp(ip: string, secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""): string {
  return createHmac("sha256", `divimesa-demo:${secret}`).update(ip).digest("hex");
}

export type DemoVisitResult = { ok: true; token: string; tableId: string } | { ok: false; reason: "rate_limited" | "unavailable" };

/** Crea una cuenta nueva de demostración (copia de la Mesa 4) en una mesa oculta. Máximo 10 por IP por hora. */
export async function createDemoVisit(ip: string): Promise<DemoVisitResult> {
  try {
    const rows = await rpc<{ token: string; table_id: string }[]>("create_demo_visit", { p_ip_hash: hashIp(ip) });
    const row = rows[0];
    if (!row) return { ok: false, reason: "unavailable" };
    return { ok: true, token: row.token, tableId: row.table_id };
  } catch (e) {
    if (e instanceof DbError && e.message.includes("rate_limited")) return { ok: false, reason: "rate_limited" };
    console.error("[demo/mesa] no se pudo crear la cuenta de demostración:", e instanceof Error ? e.message : e);
    return { ok: false, reason: "unavailable" };
  }
}
