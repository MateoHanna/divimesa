"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Ids de líneas que acaban de pasar a pagadas (durante ~1,6 s), para animarlas.
 * La primera lectura no cuenta: solo los cambios que se ven en vivo.
 */
export function useJustPaid(lines: readonly { id: string; status: string }[] | undefined): ReadonlySet<string> {
  const prev = useRef<Map<string, string> | null>(null);
  const [flash, setFlash] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const now = new Map((lines ?? []).map((l) => [l.id, l.status]));
    const before = prev.current;
    prev.current = now;
    if (!before) return;
    const fresh = [...now].filter(([id, st]) => st === "paid" && before.get(id) === "pending").map(([id]) => id);
    if (fresh.length === 0) return;
    const on = setTimeout(() => setFlash(new Set(fresh)), 0);
    const off = setTimeout(() => setFlash(new Set()), 1700);
    return () => {
      clearTimeout(on);
      clearTimeout(off);
    };
  }, [lines]);

  return flash;
}
