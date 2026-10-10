import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

import { mapDbError } from "./errors";
import { DbError, loadPanelState } from "./queries";
import { hasPanelSession } from "./session";

type Params = Record<string, string>;

interface Options<B> {
  /** Esquema del cuerpo JSON. Sin esquema, no se lee cuerpo. */
  body?: ZodType<B>;
  /** Devolver el estado actualizado en la respuesta (por defecto sí). */
  withState?: boolean;
}

/** Misma origen: si el navegador manda Origin, su host tiene que ser el de esta app. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function fail(status: number, message: string, code = "error") {
  return NextResponse.json({ ok: false, code, error: message }, { status });
}

/**
 * Envuelve una ruta del panel: verifica la cookie firmada, el origen, valida el cuerpo con zod,
 * traduce los errores de la base y devuelve el estado fresco. Nada de esto sale a los clientes.
 */
export function panelRoute<B = undefined>(
  opts: Options<B>,
  fn: (ctx: { body: B; params: Params; req: Request }) => Promise<Record<string, unknown> | void>,
) {
  return async (req: Request, ctx?: { params: Promise<Params> }): Promise<Response> => {
    try {
      if (req.method !== "GET" && !sameOrigin(req)) return fail(403, "Origen no permitido.", "forbidden");
      if (!(await hasPanelSession())) return fail(401, "Ingrese el PIN para continuar.", "unauthorized");

      let body = undefined as B;
      if (opts.body) {
        const raw: unknown = await req.json().catch(() => null);
        body = opts.body.parse(raw);
      }
      const params = ctx ? await ctx.params : {};
      const result = (await fn({ body, params, req })) ?? {};
      const state = opts.withState === false ? undefined : await loadPanelState();
      return NextResponse.json({ ok: true, ...result, ...(state ? { state } : {}) });
    } catch (e) {
      if (e instanceof ZodError) return fail(400, "Los datos enviados no son válidos.", "invalid");
      if (e instanceof DbError) {
        const m = mapDbError(e.message);
        if (m.code === "internal") console.error("[panel] error de base de datos:", e.message);
        return fail(m.status, m.message, m.code);
      }
      console.error("[panel] error inesperado:", e);
      return fail(500, "Ocurrió un error inesperado. Pruebe de nuevo.", "internal");
    }
  };
}
