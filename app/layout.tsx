import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { BRAND } from "@/lib/brand";
import "./globals.css";

const outfit = localFont({
  src: "./fonts/outfit-latin-wght.woff2",
  variable: "--font-outfit",
  weight: "100 900",
  display: "swap",
});

const description = "Cada mesa tiene un código QR. Sus clientes ven la cuenta, eligen qué pagar y pagan desde el celular. Usted ve cada pago en el momento.";

export const metadata: Metadata = {
  metadataBase: new URL(BRAND.site),
  title: { default: "Divimesa: pagos y cuentas divididas desde la mesa", template: "%s | Divimesa" },
  description,
  applicationName: "Divimesa",
  openGraph: {
    type: "website", locale: "es_CR", siteName: "Divimesa", url: "/",
    title: BRAND.tagline, description,
    images: [{ url: "/brand/og-divimesa.png", width: 1200, height: 630, alt: "Divimesa" }],
  },
  twitter: { card: "summary_large_image", title: BRAND.tagline, description, images: ["/brand/og-divimesa.png"] },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: BRAND.scarlet,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-CR" className={`${outfit.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
