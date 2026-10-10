import type { Metadata } from "next";

import { PanelApp } from "@/components/panel/panel-app";
import { PinForm } from "@/components/panel/pin-form";
import { hasPanelSession } from "@/lib/panel/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Panel del salonero",
  robots: { index: false, follow: false },
  // Para agregarlo a la pantalla de inicio y abrirlo sin la barra del navegador.
  manifest: "/panel.webmanifest",
  appleWebApp: { capable: true, title: "Divimesa", statusBarStyle: "default" },
};

export default async function PanelPage() {
  return (await hasPanelSession()) ? <PanelApp /> : <PinForm />;
}
