import { z } from "zod";

import { clientRoute, getSession, readBody, requireToken } from "@/lib/client/api";
import { loadClientState } from "@/lib/client/queries";
import { rpc } from "@/lib/panel/queries";

const schema = z.object({ itemId: z.uuid(), parts: z.number().int().min(2).max(12) });

export const POST = clientRoute(async (req, params) => {
  const token = requireToken(params.token);
  const session = getSession(req);
  const body = await readBody(req, schema);
  const r = await rpc<{ part_ids: string[] }>("client_split_item", {
    p_token: token, p_session: session, p_item_id: body.itemId, p_parts: body.parts,
  });
  return { partIds: r.part_ids, state: await loadClientState(token, session) };
});
