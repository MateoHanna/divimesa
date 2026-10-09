import { z } from "zod";

import { clientRoute, getSession, readBody, requireToken } from "@/lib/client/api";
import { loadClientState } from "@/lib/client/queries";
import { rpc } from "@/lib/panel/queries";

const schema = z.object({ itemIds: z.array(z.uuid()).max(100) });

export const POST = clientRoute(async (req, params) => {
  const token = requireToken(params.token);
  const session = getSession(req);
  const { itemIds } = await readBody(req, schema);
  const r = await rpc<{ reserved: string[]; conflicts: { id: string; reason: string }[]; reserved_until: string | null }>(
    "client_reserve_items", { p_token: token, p_session: session, p_item_ids: itemIds });
  return {
    reserved: r.reserved, conflicts: r.conflicts, reservedUntil: r.reserved_until,
    state: await loadClientState(token, session),
  };
});
