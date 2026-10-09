import { cookies } from "next/headers";

import { getServerEnv } from "@/lib/env";

import { SESSION_COOKIE, verifySession } from "./auth";

export function sessionKeys() {
  const env = getServerEnv();
  return { pin: env.PANEL_PIN, secret: env.SUPABASE_SERVICE_ROLE_KEY };
}

/** ¿La petición trae la cookie de sesión del panel, firmada y vigente? (solo servidor) */
export async function hasPanelSession(): Promise<boolean> {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value, sessionKeys());
}
