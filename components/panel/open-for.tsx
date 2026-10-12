"use client";

import { useSyncExternalStore } from "react";

import { openFor } from "@/lib/panel/elapsed";

// Reloj compartido que avanza una vez por minuto. En el servidor no hay hora: no se pinta nada hasta hidratar.
function subscribe(cb: () => void) {
  const id = setInterval(cb, 15000);
  return () => clearInterval(id);
}
const minuteNow = () => Math.floor(Date.now() / 60000) * 60000;

export function useMinuteClock(): number | null {
  return useSyncExternalStore(subscribe, minuteNow, () => null);
}

export function OpenFor({ openedAt, className }: { openedAt: string; className?: string }) {
  const now = useMinuteClock();
  const text = now === null ? null : openFor(openedAt, now);
  if (!text) return <span className={className}>&nbsp;</span>;
  return <span className={className}>{text}</span>;
}
