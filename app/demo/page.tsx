import type { Metadata } from "next";
import Link from "next/link";

import { DivimesaLogo } from "@/components/brand/divimesa-logo";
import { DemoVideo } from "@/components/demo/demo-video";
import { BRAND } from "@/lib/brand";

const TITLE = "Pago y división de la cuenta por QR en la mesa";
const DESCRIPTION = "Cada quien paga su parte desde el celular y el salonero lo ve al instante. Piloto gratis de 2 semanas para 5 restaurantes fundadores.";

// Página para mandar por correo y WhatsApp: no está en ningún menú y no se indexa, solo se llega por el enlace.
export const metadata: Metadata = {
  title: { absolute: `${TITLE} | Divimesa` },
  description: DESCRIPTION,
  alternates: { canonical: "/demo" },
  robots: { index: false, follow: false },
  openGraph: {
    type: "website", locale: "es_CR", siteName: "Divimesa", url: "/demo",
    title: TITLE, description: DESCRIPTION,
    images: [{ url: "/video/demo-poster.jpg", width: 1280, height: 720, alt: "Divimesa: ¿La mesa quiere pagar por separado?" }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/video/demo-poster.jpg"] },
};

export default function DemoLanding() {
  return (
    <div className="flex min-h-dvh flex-col bg-white text-[#1C1C1E]">
      <header className="mx-auto flex w-full max-w-5xl items-center px-5 py-5 sm:px-8">
        <DivimesaLogo className="h-8" />
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center gap-10 px-5 pb-16 sm:px-8">
        <DemoVideo />

        <section className="flex max-w-2xl flex-col items-center gap-5 text-center">
          <h1 className="text-[2.1rem] leading-[1.05] font-extrabold tracking-[-0.03em] text-balance sm:text-5xl">{TITLE}</h1>
          <p className="max-w-[40ch] text-lg leading-relaxed text-[#1C1C1E]/75 sm:text-xl">
            Piloto gratis de 2 semanas para 5 restaurantes fundadores. Sin instalación ni contrato.
          </p>
          <div className="mt-2 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <a href={BRAND.whatsappVideo} target="_blank" rel="noopener noreferrer"
              className="inline-flex h-14 items-center justify-center rounded-2xl bg-[#D91E18] px-7 text-lg font-semibold text-white transition-colors hover:bg-[#BF1A14] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D91E18]">
              Escribirme por WhatsApp
            </a>
            <Link href="/demo/mesa"
              className="inline-flex h-14 items-center justify-center rounded-2xl border-2 border-[#1C1C1E] px-7 text-lg font-semibold transition-colors hover:bg-[#1C1C1E] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1C1C1E]">
              Probar la demo
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
