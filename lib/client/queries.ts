import { DbError, rpc } from "@/lib/panel/queries";

import { toClientState } from "./state";
import type { ClientState } from "./types";

export const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;
export const SESSION_RE = /^[A-Za-z0-9_-]{16,64}$/;

/** Estado público de la mesa. Una sola consulta a la base. Lanza DbError('table_not_found') si el token no existe. */
export async function loadClientState(token: string, session: string | null): Promise<ClientState> {
  if (!TOKEN_RE.test(token)) throw new DbError("table_not_found");
  const raw = await rpc<Parameters<typeof toClientState>[0]>("client_state", { p_token: token, p_session: session });
  return toClientState(raw);
}
