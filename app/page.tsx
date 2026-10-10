import Link from "next/link";
import { QrCodeIcon } from "lucide-react";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <QrCodeIcon className="size-12 text-muted-foreground" aria-hidden />
      <h1 className="text-2xl font-extrabold">Pague su cuenta con QR</h1>
      <p className="text-muted-foreground">Escanee el código QR de su mesa para ver la cuenta y pagar, sin descargar nada ni registrarse.</p>
      <Link href="/panel" className="mt-4 text-sm text-muted-foreground underline">Panel del salonero</Link>
    </main>
  );
}
