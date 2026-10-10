import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { CheckoutDemo } from "@/components/client/checkout-demo";
import { toReceipt } from "@/lib/client/receipt";
import { DbError, rpc } from "@/lib/panel/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pago", robots: { index: false, follow: false } };

export default async function Page({ params }: PageProps<"/checkout-demo/[paymentId]">) {
  const { paymentId } = await params;
  if (!z.uuid().safeParse(paymentId).success) notFound();
  let raw;
  try {
    raw = await rpc<Parameters<typeof toReceipt>[0]>("payment_receipt", { p_payment_id: paymentId });
  } catch (e) {
    if (e instanceof DbError && e.message.includes("payment_not_found")) notFound();
    throw e;
  }
  return <CheckoutDemo receipt={toReceipt(raw)} />;
}
