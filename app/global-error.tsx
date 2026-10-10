"use client";

// Último recurso: falla el diseño base de la app. Sin dependencias, con estilos mínimos propios.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es-CR">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
        <main role="alert" style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: 24 }}>Algo no salió bien</h1>
          <p style={{ color: "#555" }}>No se pudo cargar la aplicación. Intente de nuevo.</p>
          <button type="button" onClick={() => reset()} style={{ marginTop: 12, padding: "14px 20px", fontSize: 18, borderRadius: 12, border: 0, background: "#0f766e", color: "#fff", width: "100%" }}>
            Intentar de nuevo
          </button>
        </main>
      </body>
    </html>
  );
}
