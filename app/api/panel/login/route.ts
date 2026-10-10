import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerEnv } from "@/lib/env";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/panel/auth";
import { fail, sameOrigin } from "@/lib/panel/api";
import { checkLogin, normalizeSlug, type LoginRestaurant } from "@/lib/panel/login";
import { rpc } from "@/lib/panel/queries";
import { createLimiter } from "@/lib/panel/rate-limit";
import { sessionBinding } from "@/lib/panel/session";
import { getAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// En serverless cada instancia tiene su propio contador: frena a quien prueba a mano. La defensa fuerte es el
// bloqueo por restaurante que se guarda en la base (10 PIN incorrectos seguidos, 10 minutos).
const limiter = createLimiter({ max: 5, windowMs: 60_000 });
const schema = z.object({ slug: z.string().max(40).optional(), pin: z.string().min(1).max(32) });
const BAD = "Código del restaurante o PIN incorrecto.";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Origen no permitido.", "forbidden");
  const ip = (req.headers.get("x-forwarded-for") ?? "desconocida").split(",")[0].trim();
  const gate = limiter.check(ip);
  if (!gate.allowed) {
    return NextResponse.json(
      { ok: false, code: "rate_limited", error: `Demasiados intentos. Espere ${gate.retryAfterSec} s.` },
      { status: 429, headers: { "Retry-After": String(gate.retryAfterSec) } },
    );
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, "Ingrese el PIN.", "invalid");
  const slug = normalizeSlug(parsed.data.slug);

  const env = getServerEnv();
  const { data } = await getAdminClient().from("restaurants").select("id,is_demo,panel_pin_hash,pin_locked_until")
    .eq("slug", slug).maybeSingle<LoginRestaurant>();
  const result = checkLogin({ slug, pin: parsed.data.pin }, data, { demoPin: env.PANEL_PIN, secret: env.SUPABASE_SERVICE_ROLE_KEY });

  if (!result.ok) {
    if (result.reason === "locked") {
      const min = Math.ceil(result.retryAfterSec / 60);
      return NextResponse.json(
        { ok: false, code: "locked", error: `Demasiados intentos. Espere ${min} min o pida un PIN nuevo.` },
        { status: 429, headers: { "Retry-After": String(result.retryAfterSec) } },
      );
    }
    limiter.fail(ip);
    if (data && !data.is_demo) await rpc("panel_pin_failed", { p_restaurant_id: data.id }).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 600));
    return fail(401, BAD, "bad_pin");
  }

  limiter.reset(ip);
  const r = result.restaurant;
  if (!r.is_demo) await rpc("panel_pin_ok", { p_restaurant_id: r.id }).catch(() => undefined);
  const binding = sessionBinding(r, env.PANEL_PIN);
  if (!binding) return fail(401, BAD, "bad_pin");
  const secure = new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, signSession(r.id, binding, env.SUPABASE_SERVICE_ROLE_KEY), sessionCookieOptions(secure));
  return res;
}
