import { NextResponse } from "next/server";

import { sameOrigin } from "@/lib/panel/api";
import { TOKEN_RE } from "@/lib/client/queries";
import { DbError, rpc } from "@/lib/panel/queries";

export const dynamic = "force-dynamic";

/**
 * "Recibido" o "Cobrado" de la demo pública: quien prueba hace de salonero y confirma su propio SINPE o datáfono de prueba.
 * La función SQL solo actúa sobre mesas del restaurante de demostración; en cualquier otra mesa responde 404.
 */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const noStore = { "Cache-Control": "no-store" };
  const { token } = await ctx.params;
  if (!sameOrigin(req)) return NextResponse.json({ ok: false, code: "forbidden" }, { status: 403, headers: noStore });
  if (!TOKEN_RE.test(token)) return NextResponse.json({ ok: false, code: "not_found" }, { status: 404, headers: noStore });
  try {
    await rpc("demo_confirm_sinpe", { p_token: token });
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (e) {
    if (e instanceof DbError && e.message.includes("payment_not_found")) {
      return NextResponse.json({ ok: false, code: "not_found", error: "No hay un pago por confirmar." }, { status: 404, headers: noStore });
    }
    console.error("[api/demo/confirm] error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, code: "internal", error: "Ocurrió un error inesperado." }, { status: 500, headers: noStore });
  }
}
