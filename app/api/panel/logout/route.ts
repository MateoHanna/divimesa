import { NextResponse } from "next/server";

import { SESSION_COOKIE } from "@/lib/panel/auth";
import { fail, sameOrigin } from "@/lib/panel/api";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Origen no permitido.", "forbidden");
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
