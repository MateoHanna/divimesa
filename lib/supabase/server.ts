import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getServerEnv } from "@/lib/env";

let admin: SupabaseClient | null = null;

/**
 * Cliente con service role. Salta RLS: solo para API routes y código de servidor.
 * Nunca importar desde componentes de cliente.
 */
export function getAdminClient(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("getAdminClient() solo se puede usar en el servidor.");
  }
  if (admin) return admin;
  const env = getServerEnv();
  admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}
