"use client";

import { useEffect, useRef } from "react";

const DEBOUNCE_MS = 120;

/**
 * Escucha un canal de Realtime (broadcast "changed") y avisa con un solo llamado aunque lleguen varios
 * mensajes seguidos (cada fila que cambia manda uno). El mensaje no trae datos: quien lo recibe vuelve
 * a pedir el estado. La librería se carga después de mostrar la cuenta, para no demorar la primera pantalla
 * en 4G. Si Realtime no conecta, no pasa nada: la consulta cada 3 s cubre el hueco.
 */
export function useBroadcast(channel: string | null, onChange: () => void) {
  const cb = useRef(onChange);
  useEffect(() => {
    cb.current = onChange;
  });

  useEffect(() => {
    if (!channel) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let remove: (() => void) | null = null;

    void import("@/lib/supabase/browser")
      .then(({ getBrowserClient }) => {
        if (cancelled) return;
        const client = getBrowserClient();
        const ch = client
          .channel(channel)
          .on("broadcast", { event: "changed" }, () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => cb.current(), DEBOUNCE_MS);
          })
          .subscribe();
        remove = () => void client.removeChannel(ch);
      })
      .catch(() => {
        /* sin Realtime: queda la consulta periódica */
      });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      remove?.();
    };
  }, [channel]);
}
