import type { Metadata } from "next";

export const metadata: Metadata = { title: "Página no encontrada", robots: { index: false, follow: false } };

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-5xl" aria-hidden>?</p>
      <h1 className="text-2xl font-extrabold">Este código no es válido</h1>
      <p className="text-muted-foreground">
        No encontramos esa página. Si escaneó un QR en una mesa, pídale al salonero que lo revise o que le muestre otro.
      </p>
    </main>
  );
}
