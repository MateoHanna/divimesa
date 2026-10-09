"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { newlyPaidTables, newPaymentCount } from "@/lib/panel/state";
import type { PanelState } from "@/lib/panel/types";

import { beep } from "./sound";

const POLL_MS = 3000;

export interface Notice {
  id: number;
  kind: "info" | "error" | "paid";
  text: string;
}

/**
 * Estado del panel con consulta cada 3 s solo mientras la pestaña está visible
 * (Realtime todavía no está verificado). Avisa con sonido de pagos nuevos.
 */
export function usePanel(onUnauthorized: () => void) {
  const [state, setState] = useState<PanelState | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [busy, setBusy] = useState(false);
  const prev = useRef<PanelState | null>(null);
  const seq = useRef(0);
  const inflight = useRef(0); // acciones en curso: no pisar su respuesta con una consulta vieja

  const notify = useCallback((kind: Notice["kind"], text: string) => {
    const id = ++seq.current;
    setNotices((n) => [...n.slice(-2), { id, kind, text }]);
    setTimeout(() => setNotices((n) => n.filter((x) => x.id !== id)), kind === "error" ? 6000 : 5000);
  }, []);

  const apply = useCallback(
    (next: PanelState) => {
      const paid = newlyPaidTables(prev.current, next);
      const count = newPaymentCount(prev.current, next);
      if (paid.length > 0) {
        beep();
        notify("paid", paid.length === 1 ? `Mesa ${paid[0]} pagó completo` : `Mesas ${paid.join(", ")} pagaron completo`);
      } else if (count > 0) {
        beep();
        notify("info", count === 1 ? "Entró un pago nuevo" : `Entraron ${count} pagos nuevos`);
      }
      prev.current = next;
      setState(next);
    },
    [notify],
  );

  const refresh = useCallback(async () => {
    if (inflight.current > 0) return;
    try {
      const res = await fetch("/api/panel/state", { cache: "no-store" });
      if (res.status === 401) return onUnauthorized();
      const json = (await res.json()) as { ok: boolean; state?: PanelState };
      if (json.ok && json.state && inflight.current === 0) apply(json.state);
    } catch {
      /* sin red: se reintenta en el próximo ciclo */
    }
  }, [apply, onUnauthorized]);

  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    const tick = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh]);

  /** Ejecuta una acción del panel. Devuelve true si salió bien; si no, muestra el error. */
  const act = useCallback(
    async (url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown, okText?: string) => {
      inflight.current += 1;
      setBusy(true);
      try {
        const res = await fetch(url, {
          method,
          headers: body === undefined ? undefined : { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (res.status === 401) {
          onUnauthorized();
          return false;
        }
        const json = (await res.json()) as { ok: boolean; error?: string; state?: PanelState };
        if (json.state) apply(json.state);
        if (!json.ok) {
          notify("error", json.error ?? "No se pudo completar la acción.");
          return false;
        }
        if (okText) notify("info", okText);
        return true;
      } catch {
        notify("error", "Sin conexión. Revisá el internet e intentá de nuevo.");
        return false;
      } finally {
        inflight.current -= 1;
        setBusy(false);
      }
    },
    [apply, notify, onUnauthorized],
  );

  return { state, notices, busy, act, refresh };
}
