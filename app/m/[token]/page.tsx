import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ClientApp } from "@/components/client/client-app";
import { loadClientState, TOKEN_RE } from "@/lib/client/queries";
import { getAppUrl } from "@/lib/app-url";
import { BRAND } from "@/lib/brand";
import { DbError } from "@/lib/panel/queries";
import { getAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pague su cuenta", robots: { index: false, follow: false } };

export default async function Page({ params, searchParams }: PageProps<"/m/[token]">) {
  const { token } = await params;
  const sp = await searchParams;
  if (!TOKEN_RE.test(token)) notFound();
  let initial;
  let tableId: string | null = null;
  let isDemo = false;
  try {
    // Sin sesión: la cuenta se ve de una. El navegador pide su estado con sesión al montar.
    const [state, table] = await Promise.all([
      loadClientState(token, null),
      getAdminClient().from("tables").select("id,restaurants(is_demo)").eq("qr_token", token)
        .maybeSingle<{ id: string; restaurants: { is_demo: boolean } | { is_demo: boolean }[] | null }>(),
    ]);
    initial = state;
    tableId = table.data?.id ?? null;
    const r = table.data?.restaurants;
    isDemo = (Array.isArray(r) ? r[0]?.is_demo : r?.is_demo) === true;
  } catch (e) {
    if (e instanceof DbError && e.message.includes("table_not_found")) notFound();
    throw e;
  }
  // ?grabar=1 (video de demo): siempre divimesa.com, nunca localhost, y un margen bajo el notch.
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const recording = (Array.isArray(sp.grabar) ? sp.grabar[0] : sp.grabar) === "1";
  let host: string | null = null;
  try {
    host = new URL(recording ? BRAND.site : getAppUrl()).host;
  } catch {
    host = null;
  }
  return (
    <ClientApp token={token} initial={initial} channel={tableId ? `table:${tableId}` : null}
      flash={sp.rechazo === "1" ? "declined" : undefined} host={host} recording={recording} demo={isDemo && !recording && first(sp.embed) !== "1"} />
  );
}
