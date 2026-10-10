import { NextResponse } from "next/server";

import { loadAllTableTokens } from "@/lib/panel/queries";

export const dynamic = "force-dynamic";

/**
 * "Probar la demo" de /demo: lleva a la cuenta de la Mesa 4, la mesa de demostración, sin pedir PIN.
 * Busca el token en el momento, así sigue funcionando si se regeneran los QR.
 */
export async function GET(req: Request) {
  try {
    const { tables } = await loadAllTableTokens();
    const mesa = tables.find((t) => t.number === 4) ?? tables[0];
    if (mesa) return NextResponse.redirect(new URL(`/m/${mesa.token}`, req.url));
  } catch (e) {
    console.error("[demo/mesa] no se pudo buscar la mesa de la demo:", e);
  }
  return NextResponse.redirect(new URL("/demo", req.url));
}
