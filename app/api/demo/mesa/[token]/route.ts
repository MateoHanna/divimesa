import { NextResponse } from "next/server";

import { loadDemoTable } from "@/lib/demo/table";
import { getAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Estado de solo lectura de una mesa de la demo pública. Para restaurantes reales responde 404. */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  try {
    const view = await loadDemoTable(getAdminClient(), token);
    if (!view) return NextResponse.json({ ok: false, code: "not_found", error: "No encontrada." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ ok: true, ...view }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[api/demo/mesa] error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, code: "internal", error: "Ocurrió un error inesperado." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
