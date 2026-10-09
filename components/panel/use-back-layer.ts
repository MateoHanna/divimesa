"use client";

import { useEffect, useRef } from "react";

// Cada ventana o pantalla abierta es una "capa" con su propia entrada en el historial, así el botón
// de atrás del celular cierra solo la capa de arriba en vez de salir del panel.
interface Layer { id: number; close: () => void }

const stack: Layer[] = [];
const removed = new Set<number>();
let ignore = 0;
let listening = false;
let nextId = 1;
let flushQueued = false;

function onPop() {
  if (ignore > 0) {
    ignore -= 1;
    return;
  }
  stack.pop()?.close();
}

// Si varias capas se cierran juntas (p. ej. confirmar y volver a la grilla) se retrocede una sola vez.
function flush() {
  flushQueued = false;
  const current = (history.state as { __layer?: number } | null)?.__layer;
  const n = removed.size;
  // Si se navegó a otra página, la entrada actual ya no es de una capa nuestra: no tocar el historial.
  if (n > 0 && current !== undefined && removed.has(current)) {
    ignore += 1;
    history.go(-n);
  }
  removed.clear();
}

export function useBackLayer(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });

  useEffect(() => {
    if (!open) return;
    const layer: Layer = { id: nextId++, close: () => closeRef.current() };
    history.pushState({ ...(history.state ?? {}), __layer: layer.id }, "");
    stack.push(layer);
    if (!listening) {
      window.addEventListener("popstate", onPop);
      listening = true;
    }
    return () => {
      const i = stack.indexOf(layer);
      if (i === -1) return; // ya se cerró con el botón de atrás
      stack.splice(i, 1);
      removed.add(layer.id);
      if (!flushQueued) {
        flushQueued = true;
        queueMicrotask(flush);
      }
    };
  }, [open]);
}
