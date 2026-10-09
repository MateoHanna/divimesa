import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ClientApp } from "@/components/client/client-app";
import { loadClientState, TOKEN_RE } from "@/lib/client/queries";
import { DbError } from "@/lib/panel/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pague su cuenta", robots: { index: false, follow: false } };

export default async function Page({ params }: PageProps<"/m/[token]">) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) notFound();
  let initial;
  try {
    // Sin sesión: la cuenta se ve de una. El navegador pide su estado con sesión al montar.
    initial = await loadClientState(token, null);
  } catch (e) {
    if (e instanceof DbError && e.message.includes("table_not_found")) notFound();
    throw e;
  }
  return <ClientApp token={token} initial={initial} />;
}
