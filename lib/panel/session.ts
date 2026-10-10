import { cache } from "react";
import { cookies } from "next/headers";

import { getServerEnv } from "@/lib/env";
import { getAdminClient } from "@/lib/supabase/server";

import { SESSION_COOKIE, parseSession, verifySession } from "./auth";

export interface PanelSession {
  restaurantId: string;
  isDemo: boolean;
}

/** Lo que firma la sesión de un restaurante: cambia cuando cambia su PIN. Nulo si no puede iniciar sesión. */
export function sessionBinding(r: { is_demo: boolean; panel_pin_hash: string | null }, demoPin: string): string | null {
  return r.is_demo ? `demo:${demoPin}` : r.panel_pin_hash ? `hash:${r.panel_pin_hash}` : null;
}

/**
 * La sesión del panel de esta petición: cookie firmada y vigente, del restaurante que dice la cookie.
 * El restaurante sale de la cookie (firmada), nunca de un parámetro: un panel solo ve su propio restaurante.
 */
export const getPanelSession = cache(async (): Promise<PanelSession | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const parsed = parseSession(token);
  if (!parsed) return null;
  const { data } = await getAdminClient().from("restaurants").select("id,is_demo,panel_pin_hash")
    .eq("id", parsed.restaurantId).maybeSingle<{ id: string; is_demo: boolean; panel_pin_hash: string | null }>();
  if (!data) return null;
  const env = getServerEnv();
  const binding = sessionBinding(data, env.PANEL_PIN);
  if (!binding || !verifySession(token, binding, env.SUPABASE_SERVICE_ROLE_KEY)) return null;
  return { restaurantId: data.id, isDemo: data.is_demo };
});

/** ¿La petición trae una sesión del panel válida? (solo servidor) */
export async function hasPanelSession(): Promise<boolean> {
  return (await getPanelSession()) !== null;
}
