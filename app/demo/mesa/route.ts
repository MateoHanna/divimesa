import { NextResponse } from "next/server";

import { createDemoVisit, ipFromRequest } from "@/lib/demo/visit";

export const dynamic = "force-dynamic";

const PAGE = (title: string, text: string) => `<!doctype html><html lang="es-CR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} | Divimesa</title></head>
<body style="font-family:system-ui,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;color:#1C1C1E"><main style="max-width:30rem"><h1 style="font-size:1.6rem;margin:0 0 12px">${title}</h1><p style="font-size:1.1rem;line-height:1.5;margin:0 0 20px">${text}</p><p><a href="https://wa.me/18063006454?text=Hola%20Mateo%2C%20vi%20el%20video%20de%20Divimesa" style="color:#B3140F;font-weight:600">Escríbanos por WhatsApp</a> o <a href="/" style="color:#1C1C1E">vuelva a la portada</a>.</p></main></body></html>`;

/**
 * "Pruébelo usted mismo": cada visita recibe su propia cuenta de demostración (copia de la de la Mesa 4)
 * en una mesa oculta, así nadie estorba a nadie. Máximo 10 por IP por hora.
 */
export async function GET(req: Request) {
  const res = await createDemoVisit(ipFromRequest(req));
  if (res.ok) return NextResponse.redirect(new URL(`/demo/mesa/${res.token}`, req.url));
  const limited = res.reason === "rate_limited";
  return new NextResponse(
    limited
      ? PAGE("Ya probó la demo varias veces", "Para evitar abusos, cada conexión puede abrir hasta 10 cuentas de prueba por hora. Vuelva a intentarlo más tarde.")
      : PAGE("La demo no está disponible", "No pudimos preparar su cuenta de prueba. Intente de nuevo en unos minutos."),
    { status: limited ? 429 : 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...(limited ? { "Retry-After": "3600" } : {}) } },
  );
}
