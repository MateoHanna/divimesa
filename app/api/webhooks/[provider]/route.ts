import { NextResponse } from "next/server";

import { getPaymentProvider } from "@/lib/payments";
import { processWebhook } from "@/lib/payments/webhook";
import { rpc } from "@/lib/panel/queries";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Webhook de la pasarela. No usa cookies ni sesión: la autenticidad la da la firma. */
export async function POST(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider: id } = await ctx.params;
  try {
    const provider = getPaymentProvider();
    if (provider.id !== id) return NextResponse.json({ ok: false, code: "unknown_provider" }, { status: 404 });
    const r = await processWebhook(provider, req, rpc);
    return NextResponse.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[webhook] error:", e);
    return NextResponse.json({ ok: false, code: "internal" }, { status: 500 });
  }
}
