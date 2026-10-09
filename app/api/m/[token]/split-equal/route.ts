import { z } from "zod";

import { clientRoute, getSession, readBody, requireToken } from "@/lib/client/api";
import { loadClientState } from "@/lib/client/queries";
import { rpc } from "@/lib/panel/queries";

const schema = z.object({ parts: z.number().int().min(2).max(20) });

export const POST = clientRoute(async (req, params) => {
  const token = requireToken(params.token);
  const session = getSession(req);
  const { parts } = await readBody(req, schema);
  await rpc("client_start_split", { p_token: token, p_session: session, p_parts: parts });
  return { state: await loadClientState(token, session) };
});
