export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return Response.json({ ok: false, error: "Faltan las variables de Supabase" }, { status: 503 });
  }
  const started = Date.now();
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: anon },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return Response.json(
      {
        ok: res.ok,
        supabase_status: res.status,
        latency_ms: Date.now() - started,
        service_role_key_set: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      },
      { status: res.ok ? 200 : 503 },
    );
  } catch {
    return Response.json({ ok: false, error: "No se pudo conectar con Supabase" }, { status: 503 });
  }
}
