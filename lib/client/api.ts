import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

import { sameOrigin } from "@/lib/panel/api";
import { DbError } from "@/lib/panel/queries";

import { mapClientError } from "./errors";
import { SESSION_RE, TOKEN_RE } from "./queries";

export const SESSION_HEADER = "x-session-id";

/** Error con respuesta propia (por ejemplo, platos que ya no están disponibles). */
export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

/** Id de sesión del cliente (localStorage del celular), o null si no viene o no es válido. */
export function getSession(req: Request): string | null {
  const s = req.headers.get(SESSION_HEADER);
  return s && SESSION_RE.test(s) ? s : null;
}

export function requireToken(token: string | undefined): string {
  if (!token || !TOKEN_RE.test(token)) throw new DbError("table_not_found");
  return token;
}

export async function readBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  return schema.parse(await req.json().catch(() => null));
}

type Params = Record<string, string>;

/** Rutas públicas del cliente: mismo origen en las escrituras, errores en español y nunca en caché. */
export function clientRoute(fn: (req: Request, params: Params) => Promise<Record<string, unknown>>) {
  const noStore = { "Cache-Control": "no-store" };
  return async (req: Request, ctx?: { params: Promise<Params> }): Promise<Response> => {
    try {
      if (req.method !== "GET" && !sameOrigin(req)) {
        return NextResponse.json({ ok: false, code: "forbidden", error: "Origen no permitido." }, { status: 403, headers: noStore });
      }
      const result = await fn(req, ctx ? await ctx.params : {});
      return NextResponse.json({ ok: true, ...result }, { headers: noStore });
    } catch (e) {
      if (e instanceof HttpError) {
        return NextResponse.json({ ok: false, code: e.code, error: e.message, ...e.extra }, { status: e.status, headers: noStore });
      }
      if (e instanceof ZodError) {
        return NextResponse.json({ ok: false, code: "invalid", error: "Los datos enviados no son válidos." }, { status: 400, headers: noStore });
      }
      if (e instanceof DbError) {
        const m = mapClientError(e.message);
        if (m.code === "internal") console.error("[cliente] error de base de datos:", e.message);
        return NextResponse.json({ ok: false, code: m.code, error: m.message }, { status: m.status, headers: noStore });
      }
      console.error("[cliente] error inesperado:", e);
      return NextResponse.json({ ok: false, code: "internal", error: "Ocurrió un error inesperado. Intente de nuevo." }, { status: 500, headers: noStore });
    }
  };
}
