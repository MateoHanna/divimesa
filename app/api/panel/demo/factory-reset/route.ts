import { panelRoute } from "@/lib/panel/api";
import { rpc } from "@/lib/panel/queries";

export const POST = panelRoute({}, async () => {
  await rpc("factory_reset", {});
});
