import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DemoMesa } from "@/components/demo/demo-mesa";
import { getAppUrl, tableUrl } from "@/lib/app-url";
import { loadClientState, TOKEN_RE } from "@/lib/client/queries";
import { loadDemoTable } from "@/lib/demo/table";
import { getAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pruébelo usted mismo", robots: { index: false, follow: false } };

export default async function DemoMesaPage({ params }: PageProps<"/demo/mesa/[token]">) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) notFound();
  // Solo mesas de la demo: con el token de un restaurante real esta página no existe.
  const view = await loadDemoTable(getAdminClient(), token);
  if (!view) notFound();
  const client = await loadClientState(token, null);
  let host: string | null = null;
  try { host = new URL(getAppUrl()).host; } catch { host = null; }
  return <DemoMesa token={token} client={client} view={view} host={host} qrUrl={tableUrl(token)} />;
}
