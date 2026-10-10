import { panelRoute } from "@/lib/panel/api";
import { requireDemoPanel, rpc } from "@/lib/panel/queries";

export const POST = panelRoute({}, async () => {
  await requireDemoPanel();
  await rpc("factory_reset", {});
});
