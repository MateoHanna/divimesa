import { NextResponse } from "next/server";
import { z } from "zod";

import { SESSION_COOKIE, pinMatches, sessionCookieOptions, signSession } from "@/lib/panel/auth";
import { fail, sameOrigin } from "@/lib/panel/api";
import { createLimiter } from "@/lib/panel/rate-limit";
import { sessionKeys } from "@/lib/panel/session";

export const dynamic = "force-dynamic";

// En serverless cada instancia tiene su propio contador: frena a quien prueba a mano, no es una defensa fuerte.
const limiter = createLimiter({ max: 5, windowMs: 60_000 });
const schema = z.object({ pin: z.string().min(1).max(32) });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Origen no permitido.", "forbidden");
  const ip = (req.headers.get("x-forwarded-for") ?? "desconocida").split(",")[0].trim();
  const gate = limiter.check(ip);
  if (!gate.allowed) {
    return NextResponse.json(
      { ok: false, code: "rate_limited", error: `Demasiados intentos. Esperá ${gate.retryAfterSec} s.` },
      { status: 429, headers: { "Retry-After": String(gate.retryAfterSec) } },
    );
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, "Ingresá el PIN.", "invalid");

  const keys = sessionKeys();
  if (!pinMatches(parsed.data.pin, keys.pin, keys.secret)) {
    limiter.fail(ip);
    await new Promise((r) => setTimeout(r, 600));
    return fail(401, "PIN incorrecto.", "bad_pin");
  }
  limiter.reset(ip);
  const secure = new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, signSession(keys), sessionCookieOptions(secure));
  return res;
}
