/** Texto corto de cuánto lleva abierta una mesa: "35 min", "1 h", "1 h 40 min". */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** "Abierta · 1 h 40 min". Un reloj adelantado respecto al servidor nunca da tiempo negativo. */
export function openFor(openedAt: string, now: number): string | null {
  const t = Date.parse(openedAt);
  if (!Number.isFinite(t)) return null;
  return `Abierta · ${formatElapsed(now - t)}`;
}
