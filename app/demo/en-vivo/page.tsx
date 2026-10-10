import type { Metadata } from "next";

import { DemoStage } from "@/components/demo/demo-stage";
import { PinForm } from "@/components/panel/pin-form";
import { loadAllTableTokens } from "@/lib/panel/queries";
import { hasPanelSession } from "@/lib/panel/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Demo en vivo", robots: { index: false, follow: false } };

export default async function DemoPage({ searchParams }: PageProps<"/demo/en-vivo">) {
  // Lleva los tokens de las mesas, así que pide el PIN igual que el panel.
  if (!(await hasPanelSession())) return <PinForm />;
  const sp = await searchParams;
  const { tables } = await loadAllTableTokens();
  const wanted = Number(Array.isArray(sp.mesa) ? sp.mesa[0] : sp.mesa);
  const initial = tables.some((t) => t.number === wanted) ? wanted : (tables.find((t) => t.number === 4) ?? tables[0])?.number ?? 4;
  const bar = Array.isArray(sp.barra) ? sp.barra[0] : sp.barra;
  // ?grabar=1 es el modo del video automático; ?vista=vertical deja solo el celular (1080x1920).
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const recording = first(sp.grabar) === "1" ? { tall: first(sp.vista) === "vertical" } : null;
  return <DemoStage tables={tables} initialTable={initial} showBar={bar !== "0"} recording={recording} />;
}
