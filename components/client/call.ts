import { getSessionId } from "./session";

export interface ApiResult<T = Record<string, unknown>> { status: number; json: ({ ok: boolean; error?: string; code?: string } & T) | null }

/** Llamada a las rutas públicas con el id de sesión en un encabezado. Nunca lanza: sin red devuelve json null. */
export async function call<T = Record<string, unknown>>(url: string, method: "GET" | "POST", body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      cache: "no-store",
      headers: { "x-session-id": getSessionId(), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as ApiResult<T>["json"];
    return { status: res.status, json };
  } catch {
    return { status: 0, json: null };
  }
}
