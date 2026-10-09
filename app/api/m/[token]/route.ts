import { clientRoute, getSession, requireToken } from "@/lib/client/api";
import { loadClientState } from "@/lib/client/queries";

export const dynamic = "force-dynamic";

export const GET = clientRoute(async (req, params) => {
  return { state: await loadClientState(requireToken(params.token), getSession(req)) };
});
