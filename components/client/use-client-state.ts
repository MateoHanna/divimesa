"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ClientState } from "@/lib/client/types";

import { call } from "./call";

const POLL_MS = 3000;

/**
 * Estado de la mesa: viene ya dibujado del servidor y se renueva cada 3 s solo mientras la pestaña está
 * visible (al volver a verla se consulta de inmediato). Las respuestas viejas no pisan a las nuevas.
 */
export function useClientState(
  token: string,
  initial: ClientState,
  onApply: (next: ClientState, prev: ClientState) => void,
) {
  const [state, setState] = useState(initial);
  const [synced, setSynced] = useState(false);
  const [offline, setOffline] = useState(false);
  const stateRef = useRef(initial);
  const version = useRef(0);
  const skew = useRef(0); // reloj del servidor menos el del celular, para el cronómetro de la reserva
  const onApplyRef = useRef(onApply);

  useEffect(() => {
    onApplyRef.current = onApply;
  });

  const apply = useCallback((next: ClientState) => {
    version.current += 1; // invalida consultas anteriores todavía en vuelo
    skew.current = Date.parse(next.serverTime) - Date.now();
    const prev = stateRef.current;
    stateRef.current = next;
    setState(next);
    setSynced(true);
    onApplyRef.current(next, prev);
  }, []);

  const poll = useCallback(async () => {
    const mine = ++version.current;
    const res = await call<{ state?: ClientState }>(`/api/m/${token}`, "GET");
    if (mine !== version.current) return;
    if (res.json?.ok && res.json.state) apply(res.json.state);
    setOffline(!res.json?.ok);
  }, [token, apply]);

  useEffect(() => {
    const first = setTimeout(() => void poll(), 0);
    const tick = () => {
      if (document.visibilityState === "visible") void poll();
    };
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [poll]);

  return { state, synced, offline, apply, skew, refresh: poll };
}
