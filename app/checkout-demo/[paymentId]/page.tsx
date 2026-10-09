import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { CheckoutDemo } from "@/components/client/checkout-demo";
import { formatCRC } from "@/lib/money";
import { getAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pago", robots: { index: false, follow: false } };

const LABELS: Record<string, string> = { card: "Tarjeta", apple_pay: "Apple Pay", google_pay: "Google Pay", sinpe: "SINPE Móvil" };

export default async function Page({ params }: PageProps<"/checkout-demo/[paymentId]">) {
  const { paymentId } = await params;
  if (!z.uuid().safeParse(paymentId).success) notFound();
  const { data } = await getAdminClient().from("payments")
    .select("id,amount,tip_amount,method,status,bill_id").eq("id", paymentId).maybeSingle();
  if (!data) notFound();
  const { data: bill } = await getAdminClient().from("bills").select("table_id").eq("id", data.bill_id).single();
  const { data: table } = await getAdminClient().from("tables").select("qr_token").eq("id", bill?.table_id ?? "").maybeSingle();
  return (
    <CheckoutDemo paymentId={data.id} status={data.status} token={table?.qr_token ?? null}
      amount={formatCRC(data.amount)} tip={data.tip_amount > 0 ? formatCRC(data.tip_amount) : null}
      total={formatCRC(data.amount + data.tip_amount)} method={LABELS[data.method] ?? data.method} />
  );
}
