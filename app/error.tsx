"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main role="alert" className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-extrabold">Algo no salió bien</h1>
      <p className="text-muted-foreground">No se pudo cargar esta pantalla. Su dinero no se movió. Intente de nuevo; si sigue igual, pídale ayuda al salonero.</p>
      <div className="flex w-full flex-col gap-2">
        <Button size="xl" onClick={() => reset()}>Intentar de nuevo</Button>
        <Button size="xl" variant="outline" onClick={() => window.location.reload()}>Recargar la página</Button>
      </div>
    </main>
  );
}
