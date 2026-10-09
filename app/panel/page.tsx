import type { Metadata } from "next";

import { PanelApp } from "@/components/panel/panel-app";
import { PinForm } from "@/components/panel/pin-form";
import { hasPanelSession } from "@/lib/panel/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Panel del salonero", robots: { index: false, follow: false } };

export default async function PanelPage() {
  return (await hasPanelSession()) ? <PanelApp /> : <PinForm />;
}
