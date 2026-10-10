"use client";

import { useEffect, useRef, useState } from "react";

import { formatCRC } from "@/lib/money";
import { cn } from "@/lib/utils";

const DURATION_MS = 700;

function reduced(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Monto en colones que baja (o sube) con una animación suave en vez de saltar.
 * El valor real es siempre el último que llegó: la animación solo cambia lo que se ve.
 */
export function AnimatedMoney({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const [pop, setPop] = useState(0);
  const from = useRef(value);
  const raf = useRef(0);

  useEffect(() => {
    if (from.current === value) return;
    const start = from.current;
    if (reduced()) {
      from.current = value;
      const t = setTimeout(() => setShown(value), 0);
      return () => clearTimeout(t);
    }
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / DURATION_MS);
      const eased = 1 - (1 - p) ** 3;
      from.current = Math.round(start + (value - start) * eased);
      setShown(from.current);
      if (p < 1) raf.current = requestAnimationFrame(step);
      else from.current = value;
    };
    raf.current = requestAnimationFrame(step);
    const bump = setTimeout(() => setPop((n) => n + 1), 0);
    return () => {
      cancelAnimationFrame(raf.current);
      clearTimeout(bump);
    };
  }, [value]);

  return (
    <span key={pop} className={cn("inline-block tabular-nums", pop > 0 && "animate-count-pop", className)}>
      {formatCRC(shown)}
    </span>
  );
}
